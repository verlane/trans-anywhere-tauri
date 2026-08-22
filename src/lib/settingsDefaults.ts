import type { Settings } from "./api";

/**
 * Settings used until the backend responds, and the shape reference for
 * validating an imported backup (see `backup.ts`). Values mirror the Rust
 * `Settings::default()` in settings.rs — keep the two in sync.
 */
export const DEFAULT_SETTINGS: Settings = {
  defaultAccentEn: "us",
  defaultAccentJa: "us",
  autoPlay: false,
  suggestMinLength: 2,
  suggestMaxResults: 20,
  translateTarget: "ko",
  translateTargetAlt: "ja",
  translateFallback: "en",
  minimizeToTray: false,
  alwaysOnTop: false,
  dbPath: "",
  hotkey: "Alt+W",
  pronVolume: 100,
  theme: "system",
  textScale: 100,
  hoverPreview: true,
};
