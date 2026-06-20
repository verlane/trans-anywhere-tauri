mod autocomplete;
mod commands;
mod db;
mod google;
mod http;
mod lang;
mod naver;
mod settings;

use commands::AppState;
use std::sync::Mutex;
use tauri::Manager;

/// Load the wordlist file into memory, one word per line, sorted so autocomplete
/// can binary-search by first letter. Missing file -> empty list.
fn load_wordlist(path: &std::path::Path) -> Vec<String> {
    match std::fs::read_to_string(path) {
        Ok(content) => {
            let mut words: Vec<String> = content
                .lines()
                .map(|l| l.trim())
                .filter(|l| !l.is_empty())
                .map(String::from)
                .collect();
            words.sort();
            words
        }
        Err(_) => Vec::new(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();

            let settings_path = data_dir.join("settings.json");
            let settings = settings::load(&settings_path);

            let db_path = commands::resolve_db_path(&settings, &data_dir);
            let conn = db::open(&db_path)?;
            let words = load_wordlist(&data_dir.join("wordlist.txt"));

            app.manage(AppState {
                db: Mutex::new(conn),
                words,
                data_dir,
                db_path: Mutex::new(db_path),
                settings: Mutex::new(settings),
                settings_path,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::suggest,
            commands::lookup,
            commands::ensure_pron,
            commands::get_settings,
            commands::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
