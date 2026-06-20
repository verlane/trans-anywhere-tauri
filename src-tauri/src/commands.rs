//! Tauri command surface. Holds the shared SQLite connection and the in-memory
//! wordlist, and orchestrates the lookup pipeline: cache -> Naver -> Google.

use crate::{autocomplete, db, google, lang, naver};
use std::sync::Mutex;
use tauri::State;

const MAX_SUGGESTIONS: usize = 20;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub words: Vec<String>,
    pub db_path: std::path::PathBuf,
}

#[derive(Debug, serde::Serialize)]
pub struct LookupResult {
    pub kind: String,
    pub text: String,
    pub definition: String,
    pub has_pron: bool,
    pub pron_url: Option<String>,
    pub source: String,
}

impl LookupResult {
    fn empty(text: &str) -> Self {
        Self {
            kind: "empty".into(),
            text: text.into(),
            definition: String::new(),
            has_pron: false,
            pron_url: None,
            source: String::new(),
        }
    }
}

/// Autocomplete suggestions for the in-progress English word.
#[tauri::command]
pub fn suggest(query: String, state: State<'_, AppState>) -> Vec<String> {
    autocomplete::suggest(&query, &state.words, MAX_SUGGESTIONS)
}

/// Main lookup pipeline. Sentences go to Google; English words hit the SQLite
/// cache first and fall back to the Naver dictionary (caching the result).
#[tauri::command]
pub async fn lookup(text: String, force: bool, state: State<'_, AppState>) -> Result<LookupResult, String> {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Ok(LookupResult::empty(&trimmed));
    }

    if lang::is_sentence(&trimmed) {
        let tl = if lang::detect(&trimmed) == lang::Lang::Ko { "en" } else { "ko" };
        let definition = google::translate(&trimmed, "auto", tl).await.map_err(err)?;
        return Ok(LookupResult {
            kind: "sentence".into(),
            text: trimmed,
            definition,
            has_pron: false,
            pron_url: None,
            source: "google".into(),
        });
    }

    if lang::detect(&trimmed) == lang::Lang::En {
        return lookup_english_word(trimmed, force, state).await;
    }

    // Non-English single word: fall back to Google for now.
    let definition = google::translate(&trimmed, "auto", "ko").await.map_err(err)?;
    Ok(LookupResult {
        kind: "word".into(),
        text: trimmed,
        definition,
        has_pron: false,
        pron_url: None,
        source: "google".into(),
    })
}

async fn lookup_english_word(word: String, force: bool, state: State<'_, AppState>) -> Result<LookupResult, String> {
    let key = word.to_lowercase();

    // 1. Cache lookup — skipped on a forced refresh. Lock is released before any await.
    if !force {
        let cached = with_db(&state, |conn| db::select_entry(conn, "en", "ko", &key)).map_err(err)?;
        if let Some(entry) = cached {
            return Ok(LookupResult {
                kind: "word".into(),
                text: word,
                definition: entry.definition,
                has_pron: entry.has_pron,
                pron_url: None,
                source: "cache".into(),
            });
        }
    }

    // 2. Naver dictionary (definition only — pronunciation is fetched lazily).
    let Some(result) = naver::english_to_korean(&word).await.map_err(err)? else {
        return Ok(LookupResult::empty(&word));
    };

    // 3. Cache the definition immediately so the result can render without waiting
    //    on the pronunciation download.
    let definition = result.definition.clone();
    let key_for_def = key.clone();
    with_db(&state, move |conn| {
        db::upsert_entry(conn, "en", "ko", &key_for_def, &definition, None)
    })
    .map_err(err)?;

    // 4. Download the pronunciation in the background and cache it, without
    //    blocking the response. The task opens its own DB connection.
    if let Some(url) = result.pron_url.clone() {
        let db_path = state.db_path.clone();
        tokio::spawn(async move {
            if let Ok(bytes) = naver::download_pron(&url).await {
                if !bytes.is_empty() {
                    if let Ok(conn) = db::open(&db_path) {
                        let _ = db::update_pron(&conn, "en", "ko", &key, &bytes);
                    }
                }
            }
        });
    }

    Ok(LookupResult {
        kind: "word".into(),
        text: word,
        definition: result.definition,
        has_pron: false,
        pron_url: result.pron_url,
        source: "naver".into(),
    })
}

/// Return the pronunciation MP3 bytes for a cached English word, if any.
#[tauri::command]
pub fn get_pron(word: String, state: State<'_, AppState>) -> Result<Option<Vec<u8>>, String> {
    let key = word.to_lowercase();
    with_db(&state, |conn| db::select_pron(conn, "en", "ko", &key)).map_err(err)
}

/// Download a pronunciation MP3 on demand, cache it, and return the bytes.
#[tauri::command]
pub async fn fetch_pron(word: String, url: String, state: State<'_, AppState>) -> Result<Vec<u8>, String> {
    let bytes = naver::download_pron(&url).await.map_err(err)?;
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    let key = word.to_lowercase();
    let to_store = bytes.clone();
    with_db(&state, move |conn| db::update_pron(conn, "en", "ko", &key, &to_store)).map_err(err)?;
    Ok(bytes)
}

fn with_db<T>(
    state: &State<'_, AppState>,
    f: impl FnOnce(&rusqlite::Connection) -> anyhow::Result<T>,
) -> anyhow::Result<T> {
    let conn = state
        .db
        .lock()
        .map_err(|_| anyhow::anyhow!("database lock poisoned"))?;
    f(&conn)
}

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
