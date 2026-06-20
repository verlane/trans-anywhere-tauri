//! Tauri command surface. Holds the shared SQLite connection, the in-memory
//! wordlist, and user settings, and orchestrates the lookup pipeline:
//! cache -> Naver -> Google.

use crate::settings::Settings;
use crate::{autocomplete, db, google, lang, naver};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub words: Vec<String>,
    pub data_dir: PathBuf,
    pub db_path: Mutex<PathBuf>,
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
}

/// Resolve the active DB path: a custom path from settings, or the default
/// location under the app data dir when unset.
pub fn resolve_db_path(settings: &Settings, data_dir: &Path) -> PathBuf {
    let custom = settings.db_path.trim();
    if custom.is_empty() {
        data_dir.join("Dictionary.db")
    } else {
        PathBuf::from(custom)
    }
}

#[derive(Debug, serde::Serialize)]
pub struct LookupResult {
    pub kind: String,
    pub text: String,
    pub definition: String,
    pub source: String,
}

impl LookupResult {
    fn new(kind: &str, text: String, definition: String, source: &str) -> Self {
        Self {
            kind: kind.into(),
            text,
            definition,
            source: source.into(),
        }
    }

    fn empty(text: &str) -> Self {
        Self::new("empty", text.into(), String::new(), "")
    }
}

fn settings_snapshot(state: &State<'_, AppState>) -> Settings {
    state.settings.lock().map(|s| s.clone()).unwrap_or_default()
}

/// Autocomplete suggestions for the in-progress English word.
#[tauri::command]
pub fn suggest(query: String, state: State<'_, AppState>) -> Vec<String> {
    let max = settings_snapshot(&state).suggest_max_results;
    autocomplete::suggest(&query, &state.words, max)
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
        let cfg = settings_snapshot(&state);
        let tl = if lang::detect(&trimmed) == lang::Lang::Ko {
            "en".to_string()
        } else {
            cfg.target_language
        };
        let definition = google::translate(&trimmed, "auto", &tl).await.map_err(err)?;
        return Ok(LookupResult::new("sentence", trimmed, definition, "google"));
    }

    if lang::detect(&trimmed) == lang::Lang::En {
        return lookup_english_word(trimmed, force, state).await;
    }

    // Non-English single word: fall back to Google for now.
    let definition = google::translate(&trimmed, "auto", "ko").await.map_err(err)?;
    Ok(LookupResult::new("word", trimmed, definition, "google"))
}

async fn lookup_english_word(word: String, force: bool, state: State<'_, AppState>) -> Result<LookupResult, String> {
    let key = word.to_lowercase();

    // 1. Cache lookup — skipped on a forced refresh. Lock is released before any await.
    if !force {
        let cached = with_db(&state, |conn| db::select_entry(conn, "en", "ko", &key)).map_err(err)?;
        if let Some(entry) = cached {
            return Ok(LookupResult::new("word", word, entry.definition, "cache"));
        }
    }

    // 2. Naver dictionary (definition only — pronunciations are fetched lazily).
    let Some(result) = naver::english_to_korean(&word).await.map_err(err)? else {
        return Ok(LookupResult::empty(&word));
    };

    // 3. Cache the definition immediately so the result can render without waiting
    //    on the pronunciation downloads.
    let definition = result.definition.clone();
    let key_for_def = key.clone();
    with_db(&state, move |conn| {
        db::upsert_entry(conn, "en", "ko", &key_for_def, &definition, None)
    })
    .map_err(err)?;

    // 4. Download US (media1) + UK (media2) pronunciations in the background and
    //    cache them, without blocking the response.
    let us = result.pron_us_url.clone();
    let uk = result.pron_uk_url.clone();
    if us.is_some() || uk.is_some() {
        let db_path = state.db_path.lock().map(|p| p.clone()).unwrap_or_default();
        tokio::spawn(async move {
            let us_bytes = download_opt(us).await;
            let uk_bytes = download_opt(uk).await;
            if us_bytes.is_some() || uk_bytes.is_some() {
                if let Ok(conn) = db::open(&db_path) {
                    if let Some(b) = us_bytes {
                        let _ = db::update_pron(&conn, "en", "ko", &key, db::Accent::Us, &b);
                    }
                    if let Some(b) = uk_bytes {
                        let _ = db::update_pron(&conn, "en", "ko", &key, db::Accent::Uk, &b);
                    }
                }
            }
        });
    }

    Ok(LookupResult::new("word", word, result.definition, "naver"))
}

async fn download_opt(url: Option<String>) -> Option<Vec<u8>> {
    match url {
        Some(u) => naver::download_pron(&u).await.ok().filter(|b| !b.is_empty()),
        None => None,
    }
}

/// Return pronunciation MP3 bytes for a word and accent ("us"/"uk"). Uses the cached
/// BLOB if present, otherwise fetches the correct accent from Naver and caches it.
#[tauri::command]
pub async fn ensure_pron(word: String, accent: String, state: State<'_, AppState>) -> Result<Vec<u8>, String> {
    let key = word.to_lowercase();
    let acc = db::Accent::from_str(&accent).unwrap_or(db::Accent::Us);

    if let Some(bytes) = with_db(&state, |conn| db::select_pron(conn, "en", "ko", &key, acc)).map_err(err)? {
        return Ok(bytes);
    }

    let Some(result) = naver::english_to_korean(&word).await.map_err(err)? else {
        return Ok(Vec::new());
    };
    let url = match acc {
        db::Accent::Us => result.pron_us_url,
        db::Accent::Uk => result.pron_uk_url,
    };
    let Some(url) = url else {
        return Ok(Vec::new());
    };

    let bytes = naver::download_pron(&url).await.map_err(err)?;
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    let to_store = bytes.clone();
    with_db(&state, move |conn| db::update_pron(conn, "en", "ko", &key, acc, &to_store)).map_err(err)?;
    Ok(bytes)
}

/// Return the current user settings.
#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    settings_snapshot(&state)
}

/// Persist user settings, reconnect to a new DB if the path changed, re-register
/// the global shortcut, and update the in-memory copy.
#[tauri::command]
pub fn save_settings(
    settings: Settings,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    crate::settings::save(&state.settings_path, &settings).map_err(err)?;

    let new_db = resolve_db_path(&settings, &state.data_dir);
    {
        let mut current = state.db_path.lock().map_err(|_| "db path lock poisoned".to_string())?;
        if *current != new_db {
            let conn = db::open(&new_db).map_err(err)?;
            *state.db.lock().map_err(|_| "database lock poisoned".to_string())? = conn;
            *current = new_db;
        }
    }

    #[cfg(desktop)]
    crate::apply_hotkey(&app, &settings.hotkey);
    let _ = &app;

    *state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())? = settings;
    Ok(())
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
