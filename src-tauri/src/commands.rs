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
#[serde(rename_all = "camelCase")]
pub struct LookupResult {
    pub kind: String,
    pub text: String,
    pub definition: String,
    pub source: String,
    /// Source language of a dictionary entry ("en" / "ja"), empty otherwise.
    /// The frontend uses this to label pronunciation buttons (US/UK vs female/male).
    pub lang: String,
    /// Pronunciation playback mode: "recorded" (cached MP3 from Naver), "tts"
    /// (no recording — synthesize on the client), or "" (not a dictionary entry).
    pub pron_mode: String,
}

impl LookupResult {
    fn new(
        kind: &str,
        text: String,
        definition: String,
        source: &str,
        lang: &str,
        pron_mode: &str,
    ) -> Self {
        Self {
            kind: kind.into(),
            text,
            definition,
            source: source.into(),
            lang: lang.into(),
            pron_mode: pron_mode.into(),
        }
    }

    fn empty(text: &str) -> Self {
        Self::new("empty", text.into(), String::new(), "", "", "")
    }
}

/// Playback mode for a dictionary entry: recorded MP3 if a slot exists, else TTS.
fn pron_mode(has_recording: bool) -> &'static str {
    if has_recording {
        "recorded"
    } else {
        "tts"
    }
}

/// How an input is routed once it has been trimmed and found non-empty.
#[derive(Debug, PartialEq, Eq)]
enum Route {
    Sentence,
    EnglishWord,
    JapaneseWord,
    OtherWord,
}

/// Decide how to handle a trimmed, non-empty input.
fn route(text: &str) -> Route {
    if lang::is_sentence(text) {
        return Route::Sentence;
    }
    match lang::detect(text) {
        lang::Lang::En => Route::EnglishWord,
        lang::Lang::Ja => Route::JapaneseWord,
        _ => Route::OtherWord,
    }
}

/// Pick the translation target language. `primary` is used on Enter, `secondary`
/// on the toggle shortcut. If the chosen target equals the input language it is
/// useless, so fall back to the other configured target (then "ko" as a last resort).
fn resolve_target(input: &str, alt: bool, primary: &str, secondary: &str) -> String {
    let (want, other) = if alt {
        (secondary, primary)
    } else {
        (primary, secondary)
    };
    if want != input {
        want.to_string()
    } else if other != input {
        other.to_string()
    } else {
        "ko".to_string()
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
pub async fn lookup(
    text: String,
    force: bool,
    alt: bool,
    state: State<'_, AppState>,
) -> Result<LookupResult, String> {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Ok(LookupResult::empty(&trimmed));
    }

    // Toggle shortcut: skip the dictionaries and translate into the secondary target.
    if alt {
        return translate_input(&trimmed, true, &state).await;
    }

    match route(&trimmed) {
        Route::Sentence => translate_input(&trimmed, false, &state).await,
        Route::EnglishWord => {
            lookup_dict_word(trimmed, naver::Dict::Enko, "en", force, &state).await
        }
        Route::JapaneseWord => {
            lookup_dict_word(trimmed, naver::Dict::Jako, "ja", force, &state).await
        }
        // Non-dictionary single word (e.g. Korean): translate into the primary target.
        Route::OtherWord => translate_input(&trimmed, false, &state).await,
    }
}

/// Translate the input with Google into the target resolved from settings.
async fn translate_input(
    trimmed: &str,
    alt: bool,
    state: &State<'_, AppState>,
) -> Result<LookupResult, String> {
    let cfg = settings_snapshot(state);
    let tl = resolve_target(
        lang::detect(trimmed).code(),
        alt,
        &cfg.translate_target,
        &cfg.translate_target_alt,
    );
    let definition = google::translate(trimmed, "auto", &tl).await.map_err(err)?;

    // If the translation is a single dictionary word (e.g. 変える -> "change"),
    // show that word's dictionary entry instead of the bare translation.
    let translated = definition.trim();
    if !translated.is_empty() && !lang::is_sentence(translated) {
        let dict = match route(translated) {
            Route::EnglishWord => Some((naver::Dict::Enko, "en")),
            Route::JapaneseWord => Some((naver::Dict::Jako, "ja")),
            _ => None,
        };
        if let Some((d, sl)) = dict {
            let res = lookup_dict_word(translated.to_string(), d, sl, false, state).await?;
            if res.kind != "empty" {
                return Ok(res);
            }
        }
    }

    let kind = if lang::is_sentence(trimmed) {
        "sentence"
    } else {
        "word"
    };
    Ok(LookupResult::new(
        kind,
        trimmed.to_string(),
        definition,
        "google",
        "",
        "",
    ))
}

/// Look up a single word against a Naver dictionary, caching the definition and
/// downloading pronunciations in the background. `sl` is the cache source language
/// ("en" / "ja"); the target is always "ko".
async fn lookup_dict_word(
    word: String,
    dict: naver::Dict,
    sl: &'static str,
    force: bool,
    state: &State<'_, AppState>,
) -> Result<LookupResult, String> {
    let key = word.to_lowercase();

    // 1. Cache lookup — skipped on a forced refresh. Lock is released before any await.
    if !force {
        let cached = with_db(state, |conn| db::select_entry(conn, sl, "ko", &key)).map_err(err)?;
        if let Some(entry) = cached {
            let mode = pron_mode(entry.has_us || entry.has_uk);
            return Ok(LookupResult::new(
                "word",
                word,
                entry.definition,
                "cache",
                sl,
                mode,
            ));
        }
    }

    // 2. Naver dictionary (definition only — pronunciations are fetched lazily).
    let Some(result) = naver::lookup(&word, dict).await.map_err(err)? else {
        return Ok(LookupResult::empty(&word));
    };

    // 3. Cache the definition immediately so the result can render without waiting
    //    on the pronunciation downloads.
    let definition = result.definition.clone();
    let key_for_def = key.clone();
    with_db(state, move |conn| {
        db::upsert_entry(conn, sl, "ko", &key_for_def, &definition, None)
    })
    .map_err(err)?;

    // 4. Download both pronunciation slots (media1/media2) in the background and
    //    cache them, without blocking the response.
    let us = result.pron_us_url.clone();
    let uk = result.pron_uk_url.clone();
    let has_recording = us.is_some() || uk.is_some();
    if has_recording {
        let db_path = state.db_path.lock().map(|p| p.clone()).unwrap_or_default();
        spawn_pron_download(db_path, sl, key, dict, us, uk);
    }

    Ok(LookupResult::new(
        "word",
        word,
        result.definition,
        "naver",
        sl,
        pron_mode(has_recording),
    ))
}

/// Download the US/UK (media1/media2) pronunciation slots and cache them, off the
/// request path. Opens its own DB connection so it can outlive the command.
fn spawn_pron_download(
    db_path: PathBuf,
    sl: &'static str,
    key: String,
    dict: naver::Dict,
    us: Option<String>,
    uk: Option<String>,
) {
    tokio::spawn(async move {
        let us_bytes = download_opt(us, dict).await;
        let uk_bytes = download_opt(uk, dict).await;
        if us_bytes.is_none() && uk_bytes.is_none() {
            return;
        }
        if let Ok(conn) = db::open(&db_path) {
            if let Some(b) = us_bytes {
                let _ = db::update_pron(&conn, sl, "ko", &key, db::Accent::Us, &b);
            }
            if let Some(b) = uk_bytes {
                let _ = db::update_pron(&conn, sl, "ko", &key, db::Accent::Uk, &b);
            }
        }
    });
}

async fn download_opt(url: Option<String>, dict: naver::Dict) -> Option<Vec<u8>> {
    match url {
        Some(u) => naver::download_pron(&u, dict)
            .await
            .ok()
            .filter(|b| !b.is_empty()),
        None => None,
    }
}

/// Pick the dictionary + cache source language for a word from its script.
fn dict_for_word(word: &str) -> (naver::Dict, &'static str) {
    if lang::detect(word) == lang::Lang::Ja {
        (naver::Dict::Jako, "ja")
    } else {
        (naver::Dict::Enko, "en")
    }
}

/// Return pronunciation MP3 bytes for a word and accent ("us"/"uk"). Uses the cached
/// BLOB if present, otherwise fetches the correct accent from Naver and caches it.
#[tauri::command]
pub async fn ensure_pron(
    word: String,
    accent: String,
    state: State<'_, AppState>,
) -> Result<Vec<u8>, String> {
    let key = word.to_lowercase();
    let acc = db::Accent::from_str(&accent).unwrap_or(db::Accent::Us);
    let (dict, sl) = dict_for_word(&word);

    if let Some(bytes) =
        with_db(&state, |conn| db::select_pron(conn, sl, "ko", &key, acc)).map_err(err)?
    {
        return Ok(bytes);
    }

    let Some(result) = naver::lookup(&word, dict).await.map_err(err)? else {
        return Ok(Vec::new());
    };
    let url = match acc {
        db::Accent::Us => result.pron_us_url,
        db::Accent::Uk => result.pron_uk_url,
    };
    let Some(url) = url else {
        return Ok(Vec::new());
    };

    let bytes = naver::download_pron(&url, dict).await.map_err(err)?;
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    let to_store = bytes.clone();
    with_db(&state, move |conn| {
        db::update_pron(conn, sl, "ko", &key, acc, &to_store)
    })
    .map_err(err)?;
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
        let mut current = state
            .db_path
            .lock()
            .map_err(|_| "db path lock poisoned".to_string())?;
        if *current != new_db {
            let conn = db::open(&new_db).map_err(err)?;
            *state
                .db
                .lock()
                .map_err(|_| "database lock poisoned".to_string())? = conn;
            *current = new_db;
        }
    }

    #[cfg(desktop)]
    {
        use tauri::Manager;
        crate::apply_hotkey(&app, &settings.hotkey);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_always_on_top(settings.always_on_top);
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_multiword_input_to_sentence() {
        assert!(matches!(route("did you push"), Route::Sentence));
    }

    #[test]
    fn routes_english_word_to_english_dict() {
        assert!(matches!(route("present"), Route::EnglishWord));
    }

    #[test]
    fn routes_japanese_word_to_japanese_dict() {
        assert!(matches!(route("辞書"), Route::JapaneseWord));
    }

    #[test]
    fn routes_korean_word_to_other() {
        assert!(matches!(route("사전"), Route::OtherWord));
    }

    #[test]
    fn resolve_target_korean_uses_primary_then_secondary() {
        // 한국어 입력: Enter -> 기본(en), 토글 -> 보조(ja).
        assert_eq!(resolve_target("ko", false, "en", "ja"), "en");
        assert_eq!(resolve_target("ko", true, "en", "ja"), "ja");
    }

    #[test]
    fn resolve_target_avoids_input_language() {
        // 일본어 입력 토글: 보조(ja)가 자기 자신이라 기본(en)으로 회피.
        assert_eq!(resolve_target("ja", true, "en", "ja"), "en");
        // 일본어 입력 기본: 기본(en)은 일본어가 아니므로 그대로.
        assert_eq!(resolve_target("ja", false, "en", "ja"), "en");
        // 영어 입력 기본: 기본(en)이 자기 자신이라 보조(ja)로 회피.
        assert_eq!(resolve_target("en", false, "en", "ja"), "ja");
    }
}
