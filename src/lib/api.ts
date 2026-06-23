import { invoke } from "@tauri-apps/api/core";

export type LookupKind = "word" | "sentence" | "empty";
export type LookupSource = "cache" | "naver" | "google" | "";
export type Accent = "us" | "uk";
export type ThemeMode = "light" | "dark" | "system";

export type PronMode = "recorded" | "tts" | "";

export interface LookupResult {
  kind: LookupKind;
  text: string;
  definition: string;
  source: LookupSource;
  /** Source language of a dictionary entry ("en" / "ja"), empty otherwise. */
  lang: string;
  /** "recorded" = cached MP3, "tts" = synthesize on client, "" = not a dictionary entry. */
  pronMode: PronMode;
}

export interface Settings {
  /** English default pronunciation: "us" (American) / "uk" (British). */
  defaultAccentEn: Accent;
  /** Japanese default pronunciation: "us" (female) / "uk" (male). */
  defaultAccentJa: Accent;
  autoPlay: boolean;
  suggestMinLength: number;
  suggestMaxResults: number;
  /** Primary translation target (Enter). */
  translateTarget: string;
  /** Secondary translation target (toggle shortcut). */
  translateTargetAlt: string;
  /** In-app shortcut to translate into the secondary target. */
  toggleHotkey: string;
  minimizeToTray: boolean;
  alwaysOnTop: boolean;
  dbPath: string;
  hotkey: string;
  /** Pronunciation playback volume as a percentage (0-100). */
  pronVolume: number;
  /** Color theme: light, dark, or follow the OS. */
  theme: ThemeMode;
  /** Definition body text scale as a percentage (80-140). */
  textScale: number;
  /** Show a summary-gloss tooltip on hovering an English word in a definition. */
  hoverPreview: boolean;
}

interface RawSettings {
  default_accent_en: Accent;
  default_accent_ja: Accent;
  auto_play: boolean;
  suggest_min_length: number;
  suggest_max_results: number;
  translate_target: string;
  translate_target_alt: string;
  toggle_hotkey: string;
  minimize_to_tray: boolean;
  always_on_top: boolean;
  db_path: string;
  hotkey: string;
  pron_volume: number;
  theme: string;
  text_scale: number;
  hover_preview: boolean;
}

export async function suggest(query: string): Promise<string[]> {
  return invoke<string[]>("suggest", { query });
}

/** `alt` (toggle shortcut) translates into the secondary target instead of using dictionaries. */
export async function lookup(text: string, force = false, alt = false): Promise<LookupResult> {
  return invoke<LookupResult>("lookup", { text, force, alt });
}

/** Pronunciation MP3 bytes for a word and accent: cached BLOB, else fetched from Naver. */
export async function ensurePron(word: string, accent: Accent): Promise<Uint8Array | null> {
  const bytes = await invoke<number[]>("ensure_pron", { word, accent });
  return bytes.length > 0 ? new Uint8Array(bytes) : null;
}

export async function getSettings(): Promise<Settings> {
  const raw = await invoke<RawSettings>("get_settings");
  return {
    defaultAccentEn: raw.default_accent_en,
    defaultAccentJa: raw.default_accent_ja,
    autoPlay: raw.auto_play,
    suggestMinLength: raw.suggest_min_length,
    suggestMaxResults: raw.suggest_max_results,
    translateTarget: raw.translate_target,
    translateTargetAlt: raw.translate_target_alt,
    toggleHotkey: raw.toggle_hotkey,
    minimizeToTray: raw.minimize_to_tray,
    alwaysOnTop: raw.always_on_top,
    dbPath: raw.db_path,
    hotkey: raw.hotkey,
    pronVolume: raw.pron_volume,
    theme: raw.theme as ThemeMode,
    textScale: raw.text_scale,
    hoverPreview: raw.hover_preview,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const raw: RawSettings = {
    default_accent_en: settings.defaultAccentEn,
    default_accent_ja: settings.defaultAccentJa,
    auto_play: settings.autoPlay,
    suggest_min_length: settings.suggestMinLength,
    suggest_max_results: settings.suggestMaxResults,
    translate_target: settings.translateTarget,
    translate_target_alt: settings.translateTargetAlt,
    toggle_hotkey: settings.toggleHotkey,
    minimize_to_tray: settings.minimizeToTray,
    always_on_top: settings.alwaysOnTop,
    db_path: settings.dbPath,
    hotkey: settings.hotkey,
    pron_volume: settings.pronVolume,
    theme: settings.theme,
    text_scale: settings.textScale,
    hover_preview: settings.hoverPreview,
  };
  await invoke("save_settings", { settings: raw });
}
