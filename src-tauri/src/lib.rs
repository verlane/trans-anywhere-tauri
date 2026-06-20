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

/// Long-press threshold for the show-window shortcut.
#[cfg(desktop)]
const LONG_PRESS: std::time::Duration = std::time::Duration::from_millis(350);

/// Tracks one shortcut press so the long action can fire while still held.
#[cfg(desktop)]
struct HotkeyState {
    pressed: bool,
    fired: bool,
    generation: u64,
}

#[cfg(desktop)]
static HOTKEY: std::sync::Mutex<HotkeyState> = std::sync::Mutex::new(HotkeyState {
    pressed: false,
    fired: false,
    generation: 0,
});

/// Bring the main window to the front.
#[cfg(desktop)]
fn focus_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Short press: show the window and select the input for overtyping.
#[cfg(desktop)]
fn show_main(app: &tauri::AppHandle) {
    use tauri::Emitter;
    focus_window(app);
    let _ = app.emit("show-window", ());
}

/// Marker written to the clipboard to detect whether Ctrl+C actually copied a
/// selection. The control chars make accidental user collision effectively impossible.
#[cfg(desktop)]
const COPY_SENTINEL: &str = "\u{1}__transanywhere_no_selection__\u{1}";

/// Long press: copy the current selection from the foreground app, then show the
/// window and search it. If nothing was selected, restore the clipboard and just
/// show the window. Called from the press timer thread, so it may block.
#[cfg(desktop)]
fn show_main_with_selection(app: &tauri::AppHandle) {
    use tauri::Emitter;
    let previous = read_clipboard();
    set_clipboard(COPY_SENTINEL);
    copy_selection();
    std::thread::sleep(std::time::Duration::from_millis(120));
    let copied = read_clipboard();
    focus_window(app);

    match copied {
        // Ctrl+C replaced the sentinel with real selected text.
        Some(text) if text != COPY_SENTINEL && !text.trim().is_empty() => {
            let _ = app.emit("show-window-search", text);
        }
        // Nothing was selected: restore the user's clipboard and just show.
        _ => {
            if let Some(prev) = previous {
                set_clipboard(&prev);
            }
            let _ = app.emit("show-window", ());
        }
    }
}

/// Simulate Ctrl+C to copy the foreground app's current selection.
#[cfg(desktop)]
fn copy_selection() {
    use enigo::{
        Direction::{Click, Press, Release},
        Enigo, Key, Keyboard, Settings,
    };
    if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
        let _ = enigo.key(Key::Control, Press);
        let _ = enigo.key(Key::Unicode('c'), Click);
        let _ = enigo.key(Key::Control, Release);
    }
}

/// Read the clipboard text, if any.
#[cfg(desktop)]
fn read_clipboard() -> Option<String> {
    arboard::Clipboard::new().ok()?.get_text().ok()
}

/// Write text to the clipboard, ignoring errors.
#[cfg(desktop)]
fn set_clipboard(text: &str) {
    if let Ok(mut cb) = arboard::Clipboard::new() {
        let _ = cb.set_text(text.to_owned());
    }
}

/// Re-register the global show-window shortcut. Empty/invalid hotkey clears it.
#[cfg(desktop)]
pub fn apply_hotkey(app: &tauri::AppHandle, hotkey: &str) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let trimmed = hotkey.trim();
    if !trimmed.is_empty() {
        if let Ok(shortcut) = trimmed.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            let _ = gs.register(shortcut);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                use tauri_plugin_global_shortcut::ShortcutState;
                match event.state() {
                    ShortcutState::Pressed => {
                        // Ignore key auto-repeat; arm a timer that fires the long
                        // action while the key is still held.
                        let generation = {
                            let mut s = HOTKEY.lock().unwrap();
                            if s.pressed {
                                return;
                            }
                            s.pressed = true;
                            s.fired = false;
                            s.generation = s.generation.wrapping_add(1);
                            s.generation
                        };
                        let app = app.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(LONG_PRESS);
                            let fire = {
                                let mut s = HOTKEY.lock().unwrap();
                                if s.pressed && !s.fired && s.generation == generation {
                                    s.fired = true;
                                    true
                                } else {
                                    false
                                }
                            };
                            if fire {
                                show_main_with_selection(&app);
                            }
                        });
                    }
                    ShortcutState::Released => {
                        // Released before the timer -> short tap.
                        let short = {
                            let mut s = HOTKEY.lock().unwrap();
                            let was_pressed = s.pressed;
                            s.pressed = false;
                            was_pressed && !s.fired
                        };
                        if short {
                            show_main(app);
                        }
                    }
                }
            })
            .build(),
    );

    builder
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();

            let settings_path = data_dir.join("settings.json");
            let settings = settings::load(&settings_path);
            let hotkey = settings.hotkey.clone();

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

            #[cfg(desktop)]
            apply_hotkey(app.handle(), &hotkey);

            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

                let open_item = MenuItem::with_id(app, "open", "열기", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
                let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

                TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("TransAnywhere")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "open" => focus_window(app),
                        "quit" => app.exit(0),
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            focus_window(tray.app_handle());
                        }
                    })
                    .build(app)?;

                // Closing the window hides it to the tray instead of quitting.
                if let Some(window) = app.get_webview_window("main") {
                    let win = window.clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = win.hide();
                        }
                    });
                }
            }
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
