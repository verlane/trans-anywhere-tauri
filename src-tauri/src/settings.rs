//! User settings persisted as JSON in the app data dir. `#[serde(default)]` keeps
//! the file forward-compatible as new fields are added.

use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    /// Default English pronunciation slot: "us" (American) or "uk" (British).
    #[serde(default = "default_accent")]
    pub default_accent_en: String,
    /// Default Japanese pronunciation slot: "us" (female) or "uk" (male).
    #[serde(default = "default_accent")]
    pub default_accent_ja: String,
    /// Play pronunciation automatically after a lookup.
    #[serde(default)]
    pub auto_play: bool,
    /// Minimum characters typed before suggestions appear.
    #[serde(default = "default_min_length")]
    pub suggest_min_length: usize,
    /// Maximum number of suggestions to return.
    #[serde(default = "default_max_results")]
    pub suggest_max_results: usize,
    /// Primary translation target (Enter), e.g. "en". Used by resolve_target.
    #[serde(default = "default_translate_target")]
    pub translate_target: String,
    /// Secondary translation target (toggle shortcut), e.g. "ja".
    #[serde(default = "default_translate_target_alt")]
    pub translate_target_alt: String,
    /// In-app shortcut to translate into the secondary target, e.g. "Control+Shift+Enter".
    #[serde(default = "default_toggle_hotkey")]
    pub toggle_hotkey: String,
    /// Hide the window to the tray when minimized instead of staying on the taskbar.
    #[serde(default)]
    pub minimize_to_tray: bool,
    /// Keep the window above other windows.
    #[serde(default)]
    pub always_on_top: bool,
    /// Custom dictionary DB path. Empty means the default app-data location.
    #[serde(default)]
    pub db_path: String,
    /// Global shortcut to show the window, e.g. "Alt+W". Empty disables it.
    #[serde(default = "default_hotkey")]
    pub hotkey: String,
}

fn default_hotkey() -> String {
    "Alt+W".into()
}

fn default_accent() -> String {
    "us".into()
}
fn default_min_length() -> usize {
    2
}
fn default_max_results() -> usize {
    20
}
fn default_translate_target() -> String {
    "en".into()
}
fn default_translate_target_alt() -> String {
    "ja".into()
}
fn default_toggle_hotkey() -> String {
    "Shift+Enter".into()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_accent_en: default_accent(),
            default_accent_ja: default_accent(),
            auto_play: false,
            suggest_min_length: default_min_length(),
            suggest_max_results: default_max_results(),
            translate_target: default_translate_target(),
            translate_target_alt: default_translate_target_alt(),
            toggle_hotkey: default_toggle_hotkey(),
            minimize_to_tray: false,
            always_on_top: false,
            db_path: String::new(),
            hotkey: default_hotkey(),
        }
    }
}

/// Load settings from disk, falling back to defaults on a missing or invalid file.
pub fn load(path: &Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

/// Persist settings as pretty JSON.
pub fn save(path: &Path, settings: &Settings) -> anyhow::Result<()> {
    let json = serde_json::to_string_pretty(settings)?;
    std::fs::write(path, json)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_file_yields_defaults() {
        let s = load(Path::new("does-not-exist.json"));
        assert_eq!(s.default_accent_en, "us");
        assert_eq!(s.default_accent_ja, "us");
        assert_eq!(s.suggest_max_results, 20);
        assert!(!s.auto_play);
        assert_eq!(s.translate_target, "en");
        assert_eq!(s.translate_target_alt, "ja");
        assert_eq!(s.toggle_hotkey, "Shift+Enter");
        assert!(!s.minimize_to_tray);
        assert!(!s.always_on_top);
    }

    #[test]
    fn save_then_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let s = Settings {
            default_accent_en: "uk".into(),
            default_accent_ja: "uk".into(),
            auto_play: true,
            suggest_min_length: 3,
            ..Default::default()
        };
        save(&path, &s).unwrap();

        let loaded = load(&path);
        assert_eq!(loaded.default_accent_en, "uk");
        assert_eq!(loaded.default_accent_ja, "uk");
        assert!(loaded.auto_play);
        assert_eq!(loaded.suggest_min_length, 3);
    }

    #[test]
    fn partial_json_fills_missing_with_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, r#"{ "auto_play": true }"#).unwrap();
        let s = load(&path);
        assert!(s.auto_play);
        assert_eq!(s.default_accent_en, "us");
        assert_eq!(s.default_accent_ja, "us");
        assert_eq!(s.suggest_max_results, 20);
    }
}
