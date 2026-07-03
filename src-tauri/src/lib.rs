mod autocomplete;
mod commands;
mod db;
mod google;
mod http;
#[cfg(desktop)]
mod keyguard;
mod lang;
mod naver;
mod selection;
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

/// True while a long-press copy/search action is still executing. A quick
/// release-and-retap during that window must not fire the short action on
/// top of it (the two would race on focus and emit conflicting events).
#[cfg(desktop)]
static SELECTION_IN_FLIGHT: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// The currently registered show-window shortcut. The global handler ignores
/// every other shortcut — the temporary auto-repeat guards registered during
/// a long press (e.g. bare "W") must not drive the press state machine.
#[cfg(desktop)]
static MAIN_SHORTCUT: std::sync::Mutex<Option<tauri_plugin_global_shortcut::Shortcut>> =
    std::sync::Mutex::new(None);

/// Debounce counter for persisting window geometry: every move/resize bumps it,
/// and a save only fires once the value is unchanged after a short delay.
#[cfg(desktop)]
static WINDOW_SAVE_GEN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Whether a debounce worker thread for the window-state save is already
/// running — a drag-resize fires dozens of events per second and must not
/// spawn a thread for each one.
#[cfg(desktop)]
static WINDOW_SAVE_PENDING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

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
/// show the window. Runs on the press timer thread while the hotkey is still
/// physically held, so it may block; the keyhook suppresses the held key.
#[cfg(desktop)]
fn show_main_with_selection(app: &tauri::AppHandle) {
    use tauri::Emitter;
    use tauri::Manager;
    // The user is still holding the hotkey. Its main key's hardware
    // auto-repeat must be consumed before any modifier is synthesized up —
    // otherwise a held W types "wwww" (or closes a tab as Ctrl+W) the moment
    // Alt goes up.
    let hotkey = app
        .state::<AppState>()
        .settings
        .lock()
        .map(|s| s.hotkey.clone())
        .unwrap_or_default();
    let guards = register_repeat_guards(app, &hotkey);
    let backup = backup_clipboard();
    set_clipboard(COPY_SENTINEL);
    copy_selection();
    let copied = selection::wait_for_copy(
        read_clipboard,
        COPY_SENTINEL,
        std::time::Duration::from_millis(400),
        std::time::Duration::from_millis(25),
    );
    focus_window(app);

    match copied {
        // Ctrl+C replaced the sentinel with real selected text.
        selection::CopyWait::Copied(text) => {
            let _ = app.emit("show-window-search", text);
        }
        // Nothing was selected: restore the user's clipboard and just show.
        selection::CopyWait::NothingSelected => {
            restore_clipboard(backup);
            let _ = app.emit("show-window", ());
        }
    }
    release_repeat_guards(app, guards, &hotkey);
}

/// Temporarily register the hotkey's bare main key (and Ctrl+key, covering
/// the window where our simulated Ctrl is down) as global shortcuts, so its
/// hardware auto-repeat is consumed by the OS instead of typed into the
/// focused window once the hotkey's modifiers are synthesized up. Their
/// events are ignored by the handler via MAIN_SHORTCUT.
#[cfg(desktop)]
fn register_repeat_guards(
    app: &tauri::AppHandle,
    hotkey: &str,
) -> Vec<tauri_plugin_global_shortcut::Shortcut> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let Some(token) = keyguard::main_key_token(hotkey) else {
        return Vec::new();
    };
    let gs = app.global_shortcut();
    let mut guards = Vec::new();
    // Bare key: after our Ctrl is released. Ctrl+key: while our Ctrl is down.
    // Ctrl+Alt+key: the instant between pressing Ctrl and releasing Alt.
    for spec in [
        token.clone(),
        format!("Ctrl+{token}"),
        format!("Ctrl+Alt+{token}"),
    ] {
        match spec.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            Ok(shortcut) => match gs.register(shortcut) {
                Ok(()) => guards.push(shortcut),
                Err(e) => eprintln!("[keyguard] register '{spec}' failed: {e}"),
            },
            Err(e) => eprintln!("[keyguard] parse '{spec}' failed: {e}"),
        }
    }
    eprintln!("[keyguard] {} repeat guard(s) registered", guards.len());
    guards
}

/// Drop the auto-repeat guards once the hotkey's main key is physically
/// released (never earlier — as long as the key is down it keeps repeating).
#[cfg(desktop)]
fn release_repeat_guards(
    app: &tauri::AppHandle,
    guards: Vec<tauri_plugin_global_shortcut::Shortcut>,
    hotkey: &str,
) {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    if guards.is_empty() {
        return;
    }
    let vk = keyguard::main_key_vk(hotkey).unwrap_or(0);
    let app = app.clone();
    std::thread::spawn(move || {
        keyguard::wait_until_released(vk, std::time::Duration::from_secs(10));
        let gs = app.global_shortcut();
        for shortcut in guards {
            let _ = gs.unregister(shortcut);
        }
        eprintln!("[keyguard] repeat guards released");
    });
}

/// Simulate Ctrl+C to copy the foreground app's current selection.
#[cfg(desktop)]
fn copy_selection() {
    use enigo::{
        Direction::{Click, Press, Release},
        Enigo, Key, Keyboard, Settings,
    };
    if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
        // The user is still physically holding the hotkey (e.g. Alt+W), so the
        // foreground app would see Ctrl+Alt+C — which is not Copy — unless
        // those modifiers are released first. Two guards around the Alt-up:
        //
        // 1. A benign undefined-VK tap (0xFF) marks "a key was pressed while
        //    Alt was down". Without it the target app treats the synthesized
        //    Alt-up as a lone Alt tap and arms its menu bar / KeyTips (Win11
        //    Notepad shows the accelerator overlay and the copy dies) — a
        //    modifier press alone does NOT cancel KeyTip arming there. This
        //    is AutoHotkey's A_MenuMaskKey trick, default mask vkFF.
        // 2. Ctrl goes down before Alt goes up, masking the classic
        //    DefWindowProc menu-activation path as well.
        //
        // The held key's own auto-repeat is consumed by the temporary
        // shortcut guards for every modifier combination this sequence
        // passes through.
        const VK_MENU_MASK: u32 = 0xFF;
        let _ = enigo.key(Key::Other(VK_MENU_MASK), Click);
        let _ = enigo.key(Key::Control, Press);
        let _ = enigo.key(Key::Alt, Release);
        let _ = enigo.key(Key::Shift, Release);
        let _ = enigo.key(Key::Meta, Release);
        std::thread::sleep(std::time::Duration::from_millis(20));
        // A real VK_C press, NOT Key::Unicode('c'): unicode injection arrives
        // as VK_PACKET, which the Ctrl+C accelerator handling of most apps
        // never matches — the copy silently does nothing. (v1's AutoHotkey
        // `Send ^c` always sent the real virtual key.)
        const VK_C: u32 = 0x43;
        let _ = enigo.key(Key::Other(VK_C), Click);
        let _ = enigo.key(Key::Control, Release);
    }
}

/// Snapshot of the user's clipboard taken before the sentinel overwrites it.
#[cfg(desktop)]
enum ClipboardBackup {
    Text(String),
    Image(arboard::ImageData<'static>),
    /// Empty, holds a format we can't round-trip (e.g. files), or locked.
    Unavailable,
}

#[cfg(desktop)]
fn backup_clipboard() -> ClipboardBackup {
    let Ok(mut cb) = arboard::Clipboard::new() else {
        return ClipboardBackup::Unavailable;
    };
    if let Ok(text) = cb.get_text() {
        return ClipboardBackup::Text(text);
    }
    if let Ok(image) = cb.get_image() {
        return ClipboardBackup::Image(image.to_owned_img());
    }
    ClipboardBackup::Unavailable
}

#[cfg(desktop)]
fn restore_clipboard(backup: ClipboardBackup) {
    let Ok(mut cb) = arboard::Clipboard::new() else {
        return;
    };
    match backup {
        ClipboardBackup::Text(text) => {
            let _ = cb.set_text(text);
        }
        ClipboardBackup::Image(image) => {
            let _ = cb.set_image(image);
        }
        // Nothing restorable was captured — at least don't leave the sentinel
        // string behind as the clipboard content.
        ClipboardBackup::Unavailable => {
            let _ = cb.clear();
        }
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

/// Re-register the global show-window shortcut. An empty hotkey clears it;
/// a hotkey that fails to parse or register returns the reason so callers
/// can surface it (and restore a previous working hotkey) instead of
/// silently leaving the app without any shortcut.
#[cfg(desktop)]
pub fn apply_hotkey(app: &tauri::AppHandle, hotkey: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let trimmed = hotkey.trim();
    if trimmed.is_empty() {
        if let Ok(mut main) = MAIN_SHORTCUT.lock() {
            *main = None;
        }
        return Ok(());
    }
    let shortcut = trimmed
        .parse::<tauri_plugin_global_shortcut::Shortcut>()
        .map_err(|e| format!("invalid hotkey '{trimmed}': {e}"))?;
    gs.register(shortcut)
        .map_err(|e| format!("failed to register hotkey '{trimmed}': {e}"))?;
    if let Ok(mut main) = MAIN_SHORTCUT.lock() {
        *main = Some(shortcut);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                use std::sync::atomic::Ordering;
                use tauri_plugin_global_shortcut::ShortcutState;
                // Only the configured show-window shortcut drives the press
                // state machine; the temporary auto-repeat guards (bare "W",
                // "Ctrl+W") registered during a long press are consume-only.
                let is_main = MAIN_SHORTCUT
                    .lock()
                    .map(|m| m.as_ref() == Some(shortcut))
                    .unwrap_or(false);
                if !is_main {
                    return;
                }
                match event.state() {
                    ShortcutState::Pressed => {
                        // Ignore key auto-repeat and presses while a previous
                        // long action is still running; arm a timer that fires
                        // the long action while the key is still held (v1 UX).
                        // The held key's own auto-repeat is swallowed by the
                        // keyhook for the duration of the action.
                        if SELECTION_IN_FLIGHT.load(Ordering::SeqCst) {
                            return;
                        }
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
                                    // The press session ends here: once the
                                    // modifiers are synthesized up, the plugin
                                    // may never deliver a Released event, so
                                    // don't leave `pressed` waiting on one.
                                    s.pressed = false;
                                    // Claimed inside the lock so a release+retap
                                    // can't observe a not-yet-flagged long action.
                                    SELECTION_IN_FLIGHT.store(true, Ordering::SeqCst);
                                    true
                                } else {
                                    false
                                }
                            };
                            if fire {
                                show_main_with_selection(&app);
                                SELECTION_IN_FLIGHT.store(false, Ordering::SeqCst);
                            }
                        });
                    }
                    ShortcutState::Released => {
                        // Released before the timer -> short tap. A long press
                        // already ran (or is running) its action from the timer
                        // thread; `pressed` was cleared there.
                        let short = {
                            let mut s = HOTKEY.lock().unwrap();
                            let was_pressed = s.pressed;
                            s.pressed = false;
                            was_pressed && !s.fired
                        };
                        if short && !SELECTION_IN_FLIGHT.load(Ordering::SeqCst) {
                            show_main(app);
                        }
                    }
                }
            })
            .build(),
    );

    // Restore and persist window position/size across restarts.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();

            let settings_path = data_dir.join("settings.json");
            let settings = settings::load(&settings_path);
            let hotkey = settings.hotkey.clone();
            #[cfg(desktop)]
            let always_on_top = settings.always_on_top;

            // A stale custom db_path (removed drive, typo) must not brick
            // startup forever: fall back to the default cache location.
            let db_path = commands::resolve_db_path(&settings, &data_dir);
            let (conn, db_path) = match db::open(&db_path) {
                Ok(conn) => (conn, db_path),
                Err(e) => {
                    eprintln!("[db] cannot open {}: {e}; using default", db_path.display());
                    let fallback = data_dir.join("Dictionary.db");
                    (db::open(&fallback)?, fallback)
                }
            };
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
            if let Err(e) = apply_hotkey(app.handle(), &hotkey) {
                eprintln!("[hotkey] {e}");
            }

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

                // The window starts hidden (visible:false) so the window-state
                // plugin can restore its position before it appears — otherwise it
                // would flash at the default spot first. Apply settings, then show.
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_always_on_top(always_on_top);
                    let _ = window.show();
                    let _ = window.set_focus();
                }

                // Closing the window hides it to the tray instead of quitting.
                // Minimizing optionally hides to the tray too (per setting).
                if let Some(window) = app.get_webview_window("main") {
                    let win = window.clone();
                    let handle = app.handle().clone();
                    window.on_window_event(move |event| {
                        use tauri_plugin_window_state::{AppHandleExt, StateFlags};
                        match event {
                            tauri::WindowEvent::CloseRequested { api, .. } => {
                                api.prevent_close();
                                let _ = win.hide();
                            }
                            tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                                let minimized = win.is_minimized().unwrap_or(false);
                                if !minimized {
                                    // Debounce: persist position/size once the window
                                    // has been still for a moment, not on every pixel.
                                    // One worker thread handles the whole burst.
                                    use std::sync::atomic::Ordering;
                                    let generation =
                                        WINDOW_SAVE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
                                    if !WINDOW_SAVE_PENDING.swap(true, Ordering::SeqCst) {
                                        let save_handle = handle.clone();
                                        std::thread::spawn(move || {
                                            let mut seen = generation;
                                            loop {
                                                std::thread::sleep(
                                                    std::time::Duration::from_millis(400),
                                                );
                                                let now = WINDOW_SAVE_GEN.load(Ordering::SeqCst);
                                                if now != seen {
                                                    seen = now;
                                                    continue;
                                                }
                                                let _ = save_handle.save_window_state(
                                                    StateFlags::SIZE | StateFlags::POSITION,
                                                );
                                                WINDOW_SAVE_PENDING.store(false, Ordering::SeqCst);
                                                // An event may have landed between the gen
                                                // check and the reset; reclaim the worker so
                                                // that final geometry still gets saved.
                                                if WINDOW_SAVE_GEN.load(Ordering::SeqCst) != seen
                                                    && !WINDOW_SAVE_PENDING
                                                        .swap(true, Ordering::SeqCst)
                                                {
                                                    seen = WINDOW_SAVE_GEN.load(Ordering::SeqCst);
                                                    continue;
                                                }
                                                break;
                                            }
                                        });
                                    }
                                } else if matches!(event, tauri::WindowEvent::Resized(_)) {
                                    let to_tray = handle
                                        .state::<AppState>()
                                        .settings
                                        .lock()
                                        .map(|s| s.minimize_to_tray)
                                        .unwrap_or(false);
                                    if to_tray {
                                        let _ = win.hide();
                                    }
                                }
                            }
                            _ => {}
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
