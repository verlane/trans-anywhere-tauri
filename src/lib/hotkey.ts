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

/** Does a keydown match an accelerator string like "Control+Shift+Enter"? */
export function matchHotkey(e: KeyboardEvent, hotkey: string): boolean {
  if (!hotkey) {
    return false;
  }
  const parts = hotkey.split("+");
  const key = parts[parts.length - 1];
  if (
    e.ctrlKey !== parts.includes("Control") ||
    e.altKey !== parts.includes("Alt") ||
    e.shiftKey !== parts.includes("Shift") ||
    e.metaKey !== parts.includes("Super")
  ) {
    return false;
  }
  const pressed = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  return pressed === key;
}
