import { invoke } from "@tauri-apps/api/core";

export type LookupKind = "word" | "sentence" | "empty";
export type LookupSource = "cache" | "naver" | "google" | "";
export type Accent = "us" | "uk";

export interface LookupResult {
  kind: LookupKind;
  text: string;
  definition: string;
  source: LookupSource;
}

export interface Settings {
  defaultAccent: Accent;
  autoPlay: boolean;
  suggestMinLength: number;
  suggestMaxResults: number;
  targetLanguage: string;
  dbPath: string;
  hotkey: string;
}

interface RawSettings {
  default_accent: Accent;
  auto_play: boolean;
  suggest_min_length: number;
  suggest_max_results: number;
  target_language: string;
  db_path: string;
  hotkey: string;
}

export async function suggest(query: string): Promise<string[]> {
  return invoke<string[]>("suggest", { query });
}

export async function lookup(text: string, force = false): Promise<LookupResult> {
  return invoke<LookupResult>("lookup", { text, force });
}

/** Pronunciation MP3 bytes for a word and accent: cached BLOB, else fetched from Naver. */
export async function ensurePron(word: string, accent: Accent): Promise<Uint8Array | null> {
  const bytes = await invoke<number[]>("ensure_pron", { word, accent });
  return bytes.length > 0 ? new Uint8Array(bytes) : null;
}

export async function getSettings(): Promise<Settings> {
  const raw = await invoke<RawSettings>("get_settings");
  return {
    defaultAccent: raw.default_accent,
    autoPlay: raw.auto_play,
    suggestMinLength: raw.suggest_min_length,
    suggestMaxResults: raw.suggest_max_results,
    targetLanguage: raw.target_language,
    dbPath: raw.db_path,
    hotkey: raw.hotkey,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  const raw: RawSettings = {
    default_accent: settings.defaultAccent,
    auto_play: settings.autoPlay,
    suggest_min_length: settings.suggestMinLength,
    suggest_max_results: settings.suggestMaxResults,
    target_language: settings.targetLanguage,
    db_path: settings.dbPath,
    hotkey: settings.hotkey,
  };
  await invoke("save_settings", { settings: raw });
}
