//! SQLite cache layer. Schema is kept compatible with the v1 Class_Dictionary.ahk
//! `entries` table so an existing Dictionary.db can be reused as-is.

use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
pub struct Entry {
    pub id: i64,
    pub word: String,
    pub definition: String,
    pub has_pron: bool,
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
  PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS source_language_index ON entries (source_language COLLATE NOCASE ASC);
CREATE INDEX IF NOT EXISTS target_language_index ON entries (target_language COLLATE NOCASE ASC);
CREATE INDEX IF NOT EXISTS word_index ON entries (word COLLATE NOCASE ASC);
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
    Ok(conn)
}

/// Look up a cached entry. Only rows with a non-empty definition are treated as hits,
/// matching the v1 cache-validity check.
pub fn select_entry(conn: &Connection, sl: &str, tl: &str, word: &str) -> anyhow::Result<Option<Entry>> {
    let row = conn
        .query_row(
            "SELECT id, word, definition, media1 IS NOT NULL
             FROM entries
             WHERE source_language = ?1 AND target_language = ?2 AND word = ?3
             LIMIT 1",
            params![sl, tl, word],
            |r| {
                Ok(Entry {
                    id: r.get(0)?,
                    word: r.get(1)?,
                    definition: r.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    has_pron: r.get(3)?,
                })
            },
        )
        .optional()?;

    Ok(row.filter(|e| !e.definition.is_empty()))
}

/// Fetch the pronunciation BLOB (media1) for a cached word, if present.
pub fn select_pron(conn: &Connection, sl: &str, tl: &str, word: &str) -> anyhow::Result<Option<Vec<u8>>> {
    let blob = conn
        .query_row(
            "SELECT media1 FROM entries
             WHERE source_language = ?1 AND target_language = ?2 AND word = ?3 AND media1 IS NOT NULL
             LIMIT 1",
            params![sl, tl, word],
            |r| r.get::<_, Vec<u8>>(0),
        )
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

/// Update only the pronunciation BLOB for an existing word (definition untouched).
pub fn update_pron(conn: &Connection, sl: &str, tl: &str, word: &str, media1: &[u8]) -> anyhow::Result<()> {
    conn.execute(
        "UPDATE entries SET media1 = ?1
         WHERE source_language = ?2 AND target_language = ?3 AND word = ?4",
        params![media1, sl, tl, word],
    )?;
    Ok(())
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
    fn insert_then_select_roundtrip() {
        let conn = mem();
        upsert_entry(&conn, "en", "ko", "present", "현재의", Some(&[1, 2, 3])).unwrap();
        let entry = select_entry(&conn, "en", "ko", "present").unwrap().unwrap();
        assert_eq!(entry.word, "present");
        assert_eq!(entry.definition, "현재의");
        assert!(entry.has_pron);

        let pron = select_pron(&conn, "en", "ko", "present").unwrap().unwrap();
        assert_eq!(pron, vec![1, 2, 3]);
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
}
