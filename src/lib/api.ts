import { invoke } from "@tauri-apps/api/core";

export type LookupKind = "word" | "sentence" | "empty";
export type LookupSource = "cache" | "naver" | "google" | "";

export interface LookupResult {
  kind: LookupKind;
  text: string;
  definition: string;
  hasPron: boolean;
  pronUrl: string | null;
  source: LookupSource;
}

interface RawLookupResult {
  kind: LookupKind;
  text: string;
  definition: string;
  has_pron: boolean;
  pron_url: string | null;
  source: LookupSource;
}

export async function suggest(query: string): Promise<string[]> {
  return invoke<string[]>("suggest", { query });
}

export async function lookup(text: string, force = false): Promise<LookupResult> {
  const raw = await invoke<RawLookupResult>("lookup", { text, force });
  return {
    kind: raw.kind,
    text: raw.text,
    definition: raw.definition,
    hasPron: raw.has_pron,
    pronUrl: raw.pron_url,
    source: raw.source,
  };
}

/** Fetch pronunciation MP3 bytes for a cached word, or null when unavailable. */
export async function getPron(word: string): Promise<Uint8Array | null> {
  const bytes = await invoke<number[] | null>("get_pron", { word });
  return bytes ? new Uint8Array(bytes) : null;
}

/** Download a pronunciation MP3 on demand (and cache it), returning the bytes. */
export async function fetchPron(word: string, url: string): Promise<Uint8Array | null> {
  const bytes = await invoke<number[]>("fetch_pron", { word, url });
  return bytes.length > 0 ? new Uint8Array(bytes) : null;
}
