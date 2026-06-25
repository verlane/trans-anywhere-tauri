//! SQLite cache layer. Schema is kept compatible with the v1 Class_Dictionary.ahk
//! `entries` table so an existing Dictionary.db can be reused as-is.

use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
pub struct Entry {
    pub id: i64,
    pub word: String,
    pub definition: String,
    pub has_us: bool,
    pub has_uk: bool,
    /// Whether a pronunciation fetch was already attempted (so we don't keep
    /// re-hitting Naver for words that simply have no recording for a slot).
    pub media_tried: bool,
}

/// Pronunciation accent. US is stored in media1, UK in media2.
#[derive(Debug, Clone, Copy)]
pub enum Accent {
    Us,
    Uk,
}

impl Accent {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "us" => Some(Accent::Us),
            "uk" => Some(Accent::Uk),
            _ => None,
        }
    }

    fn column(self) -> &'static str {
        match self {
            Accent::Us => "media1",
            Accent::Uk => "media2",
        }
    }
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS entries (
  id integer NOT NULL,
  created_at text NOT NULL DEFAULT (DATETIME('now', 'localtime')),
  updated_at text NOT NULL DEFAULT (DATETIME('now', 'localtime')),
  source_language text NOT NULL COLLATE NOCASE,
  target_language text NOT NULL COLLATE NOCASE,
  word text NOT NULL COLLATE NOCASE,
  definition text COLLATE NOCASE,
  media1 blob,
  media2 blob,
  media_tried integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS source_language_index ON entries (source_language COLLATE NOCASE ASC);
CREATE INDEX IF NOT EXISTS target_language_index ON entries (target_language COLLATE NOCASE ASC);
CREATE INDEX IF NOT EXISTS word_index ON entries (word COLLATE NOCASE ASC);
CREATE TABLE IF NOT EXISTS aliases (
  source_language text NOT NULL COLLATE NOCASE,
  target_language text NOT NULL COLLATE NOCASE,
  alias text NOT NULL COLLATE NOCASE,
  headword text NOT NULL COLLATE NOCASE,
  PRIMARY KEY (source_language, target_language, alias)
);
";

/// Open (or create) the database at `path`, ensuring the schema exists.
pub fn open(path: &Path) -> anyhow::Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let conn = Connection::open(path)?;
    // Two connections write to this file (the request handler and the background
    // pronunciation task), so wait instead of failing on a locked write.
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    conn.execute_batch(SCHEMA)?;
    // Migrate DBs created before media_tried existed (ignored if already present).
    let _ = conn.execute(
        "ALTER TABLE entries ADD COLUMN media_tried integer NOT NULL DEFAULT 0",
        [],
    );
    Ok(conn)
}

/// Look up a cached entry. Only rows with a non-empty definition are treated as hits,
/// matching the v1 cache-validity check.
pub fn select_entry(
    conn: &Connection,
    sl: &str,
    tl: &str,
    word: &str,
) -> anyhow::Result<Option<Entry>> {
    let row = conn
        .query_row(
            "SELECT id, word, definition, media1 IS NOT NULL, media2 IS NOT NULL, media_tried
             FROM entries
             WHERE source_language = ?1 AND target_language = ?2 AND word = ?3
             LIMIT 1",
            params![sl, tl, word],
            |r| {
                Ok(Entry {
                    id: r.get(0)?,
                    word: r.get(1)?,
                    definition: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    has_us: r.get(3)?,
                    has_uk: r.get(4)?,
                    media_tried: r.get(5)?,
                })
            },
        )
        .optional()?;

    Ok(row.filter(|e| !e.definition.is_empty()))
}

/// Mark that a pronunciation fetch was attempted for a word (whether or not it
/// found audio), so background backfill won't repeatedly re-query Naver.
pub fn set_media_tried(conn: &Connection, sl: &str, tl: &str, word: &str) -> anyhow::Result<()> {
    conn.execute(
        "UPDATE entries SET media_tried = 1
         WHERE source_language = ?1 AND target_language = ?2 AND word = ?3",
        params![sl, tl, word],
    )?;
    Ok(())
}

/// Fetch the pronunciation BLOB for a cached word and accent, if present.
pub fn select_pron(
    conn: &Connection,
    sl: &str,
    tl: &str,
    word: &str,
    accent: Accent,
) -> anyhow::Result<Option<Vec<u8>>> {
    let col = accent.column();
    let sql = format!(
        "SELECT {col} FROM entries
         WHERE source_language = ?1 AND target_language = ?2 AND word = ?3 AND {col} IS NOT NULL
         LIMIT 1"
    );
    let blob = conn
        .query_row(&sql, params![sl, tl, word], |r| r.get::<_, Vec<u8>>(0))
        .optional()?;
    Ok(blob)
}

/// Insert or update a cached entry with its definition and optional pronunciation BLOB.
pub fn upsert_entry(
    conn: &Connection,
    sl: &str,
    tl: &str,
    word: &str,
    definition: &str,
    media1: Option<&[u8]>,
) -> anyhow::Result<()> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM entries WHERE source_language = ?1 AND target_language = ?2 AND word = ?3 LIMIT 1",
            params![sl, tl, word],
            |r| r.get(0),
        )
        .optional()?;

    match exists {
        Some(id) => {
            conn.execute(
                "UPDATE entries
                 SET updated_at = DATETIME('now', 'localtime'), definition = ?1, media1 = ?2
                 WHERE id = ?3",
                params![definition, media1, id],
            )?;
        }
        None => {
            conn.execute(
                "INSERT INTO entries (source_language, target_language, word, definition, media1)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![sl, tl, word, definition, media1],
            )?;
        }
    }
    Ok(())
}

/// Update only the pronunciation BLOB for an existing word and accent (definition untouched).
pub fn update_pron(
    conn: &Connection,
    sl: &str,
    tl: &str,
    word: &str,
    accent: Accent,
    blob: &[u8],
) -> anyhow::Result<()> {
    let sql = format!(
        "UPDATE entries SET {} = ?1
         WHERE source_language = ?2 AND target_language = ?3 AND word = ?4",
        accent.column()
    );
    conn.execute(&sql, params![blob, sl, tl, word])?;
    Ok(())
}

/// Look up the canonical headword an alias points to (e.g. "cheats" -> "cheat").
pub fn select_alias(
    conn: &Connection,
    sl: &str,
    tl: &str,
    alias: &str,
) -> anyhow::Result<Option<String>> {
    let head = conn
        .query_row(
            "SELECT headword FROM aliases
             WHERE source_language = ?1 AND target_language = ?2 AND alias = ?3
             LIMIT 1",
            params![sl, tl, alias],
            |r| r.get::<_, String>(0),
        )
        .optional()?;
    Ok(head)
}

/// Record that an inflected form maps to a canonical headword, so a later lookup
/// of the form hits the cache instead of re-querying Naver.
pub fn upsert_alias(
    conn: &Connection,
    sl: &str,
    tl: &str,
    alias: &str,
    headword: &str,
) -> anyhow::Result<()> {
    conn.execute(
        "INSERT INTO aliases (source_language, target_language, alias, headword)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT (source_language, target_language, alias)
         DO UPDATE SET headword = excluded.headword",
        params![sl, tl, alias, headword],
    )?;
    Ok(())
}

/// Resolve a lookup key to its canonical headword: the alias target if one is
/// recorded, otherwise the key itself.
pub fn resolve_key(conn: &Connection, sl: &str, tl: &str, key: &str) -> anyhow::Result<String> {
    Ok(select_alias(conn, sl, tl, key)?.unwrap_or_else(|| key.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        conn
    }

    #[test]
    fn media_tried_defaults_false_and_can_be_set() {
        let conn = mem();
        upsert_entry(&conn, "en", "ko", "word", "뜻", None).unwrap();
        assert!(
            !select_entry(&conn, "en", "ko", "word")
                .unwrap()
                .unwrap()
                .media_tried
        );
        set_media_tried(&conn, "en", "ko", "word").unwrap();
        assert!(
            select_entry(&conn, "en", "ko", "word")
                .unwrap()
                .unwrap()
                .media_tried
        );
    }

    #[test]
    fn insert_then_select_roundtrip() {
        let conn = mem();
        upsert_entry(&conn, "en", "ko", "present", "현재의", Some(&[1, 2, 3])).unwrap();
        let entry = select_entry(&conn, "en", "ko", "present").unwrap().unwrap();
        assert_eq!(entry.word, "present");
        assert_eq!(entry.definition, "현재의");
        assert!(entry.has_us);
        assert!(!entry.has_uk);

        let us = select_pron(&conn, "en", "ko", "present", Accent::Us)
            .unwrap()
            .unwrap();
        assert_eq!(us, vec![1, 2, 3]);
        assert!(select_pron(&conn, "en", "ko", "present", Accent::Uk)
            .unwrap()
            .is_none());
    }

    #[test]
    fn update_pron_writes_uk_column() {
        let conn = mem();
        upsert_entry(&conn, "en", "ko", "schedule", "일정", None).unwrap();
        update_pron(&conn, "en", "ko", "schedule", Accent::Uk, &[9, 8, 7]).unwrap();
        let entry = select_entry(&conn, "en", "ko", "schedule")
            .unwrap()
            .unwrap();
        assert!(!entry.has_us);
        assert!(entry.has_uk);
        let uk = select_pron(&conn, "en", "ko", "schedule", Accent::Uk)
            .unwrap()
            .unwrap();
        assert_eq!(uk, vec![9, 8, 7]);
    }

    #[test]
    fn empty_definition_is_not_a_hit() {
        let conn = mem();
        upsert_entry(&conn, "en", "ko", "ghost", "", None).unwrap();
        assert!(select_entry(&conn, "en", "ko", "ghost").unwrap().is_none());
    }

    #[test]
    fn upsert_updates_existing_definition() {
        let conn = mem();
        upsert_entry(&conn, "en", "ko", "run", "", None).unwrap();
        upsert_entry(&conn, "en", "ko", "run", "달리다", None).unwrap();
        let entry = select_entry(&conn, "en", "ko", "run").unwrap().unwrap();
        assert_eq!(entry.definition, "달리다");
    }

    #[test]
    fn alias_roundtrip_and_resolve_key() {
        let conn = mem();
        // 별칭이 없으면 키 자신을 반환한다.
        assert_eq!(resolve_key(&conn, "en", "ko", "cheats").unwrap(), "cheats");

        upsert_alias(&conn, "en", "ko", "cheats", "cheat").unwrap();
        assert_eq!(
            select_alias(&conn, "en", "ko", "cheats")
                .unwrap()
                .as_deref(),
            Some("cheat")
        );
        // 별칭이 있으면 표제어로 해석된다.
        assert_eq!(resolve_key(&conn, "en", "ko", "cheats").unwrap(), "cheat");
        // 표제어 자신은 별칭이 아니므로 그대로 통과한다.
        assert_eq!(resolve_key(&conn, "en", "ko", "cheat").unwrap(), "cheat");
    }

    #[test]
    fn upsert_alias_overwrites_target() {
        let conn = mem();
        upsert_alias(&conn, "en", "ko", "ran", "wrong").unwrap();
        upsert_alias(&conn, "en", "ko", "ran", "run").unwrap();
        assert_eq!(resolve_key(&conn, "en", "ko", "ran").unwrap(), "run");
    }

}
