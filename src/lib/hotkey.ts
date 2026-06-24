import type { KeyboardEvent } from "react";

const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta"];

/** Build a Tauri-style accelerator (e.g. "Control+Shift+Enter") from a keydown, or null. */
export function captureHotkey(e: KeyboardEvent): string | null {
  const key = e.key;
  if (MODIFIER_KEYS.includes(key)) {
    return null;
  }
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Control");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  if (parts.length === 0) {
    return null; // an app/global shortcut needs at least one modifier
  }
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

/** Display an accelerator in a friendlier form (Control -> Ctrl, Super -> Win). */
export function prettyHotkey(hotkey: string): string {
  if (!hotkey) {
    return "(없음)";
  }
  return hotkey.replace(/Control/g, "Ctrl").replace(/Super/g, "Win");
}

/**
 * Fixed in-app textarea key bindings. Labels and matchers live together so the
 * help text in the settings panel can never drift from the actual behavior.
 */
export const EDITOR_KEY = {
  search: "Enter",
  translateAlt: "Ctrl+Enter",
  newline: "Shift+Enter",
} as const;

/** Ctrl+Enter (or Cmd+Enter) — translate into the secondary target language. */
export function isTranslateAltKey(e: KeyboardEvent): boolean {
  return e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
}

/** Shift+Enter — insert a newline instead of running the search. */
export function isNewlineKey(e: KeyboardEvent): boolean {
  return e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
}
