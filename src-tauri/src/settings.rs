//! User settings persisted as JSON in the app data dir. `#[serde(default)]` keeps
//! the file forward-compatible as new fields are added.

use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Settings {
    /// Default pronunciation accent: "us" or "uk".
    #[serde(default = "default_accent")]
    pub default_accent: String,
    /// Play pronunciation automatically after a lookup.
    #[serde(default)]
    pub auto_play: bool,
    /// Minimum characters typed before suggestions appear.
    #[serde(default = "default_min_length")]
    pub suggest_min_length: usize,
    /// Maximum number of suggestions to return.
    #[serde(default = "default_max_results")]
    pub suggest_max_results: usize,
    /// Target language for sentence translation.
    #[serde(default = "default_target_language")]
    pub target_language: String,
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
fn default_target_language() -> String {
    "ko".into()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            default_accent: default_accent(),
            auto_play: false,
            suggest_min_length: default_min_length(),
            suggest_max_results: default_max_results(),
            target_language: default_target_language(),
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
        assert_eq!(s.default_accent, "us");
        assert_eq!(s.suggest_max_results, 20);
        assert!(!s.auto_play);
    }

    #[test]
    fn save_then_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        let mut s = Settings::default();
        s.default_accent = "uk".into();
        s.auto_play = true;
        s.suggest_min_length = 3;
        save(&path, &s).unwrap();

        let loaded = load(&path);
        assert_eq!(loaded.default_accent, "uk");
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
        assert_eq!(s.default_accent, "us");
        assert_eq!(s.suggest_max_results, 20);
    }
}
