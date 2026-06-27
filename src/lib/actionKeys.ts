/**
 * In-app action shortcuts, kept layout/IME-independent by matching `e.code`
 * (mirrors the Alt+H/L navigation keys in App.tsx). All bindings are Alt-based
 * so they never collide with text editing in the always-focused input; copy is
 * the one exception that also accepts the muscle-memory Ctrl+C.
 */
export type ActionKey =
  | "play-primary"
  | "play-secondary"
  | "copy-result"
  | "toggle-favorite"
  | "refresh"
  | "open-favorites"
  | "open-settings";

/** The subset of a keydown event the resolver needs (React or DOM events fit). */
export interface ActionKeyEvent {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
}

/** Display labels for the help panel, kept beside the matcher so they can't drift. */
export const ACTION_KEY = {
  playPrimary: "Alt+P",
  playSecondary: "Alt+Shift+P",
  copy: "Alt+C / Ctrl+C",
  toggleFavorite: "Alt+D",
  refresh: "Alt+R",
  openFavorites: "Alt+B",
  openSettings: "Alt+S",
} as const;

/** Alt+letter (no Shift) actions, keyed by `e.code`. Pronunciation is handled separately. */
const ALT_ACTIONS: Record<string, ActionKey> = {
  KeyC: "copy-result",
  KeyD: "toggle-favorite",
  KeyR: "refresh",
  KeyB: "open-favorites",
  KeyS: "open-settings",
};

/** Map a keydown to an in-app action, or null when it isn't one of ours. */
export function resolveActionKey(e: ActionKeyEvent): ActionKey | null {
  if (e.isComposing || e.metaKey) {
    return null;
  }
  // Ctrl+C is the only Ctrl binding (copy muscle memory); everything else is Alt.
  if (e.ctrlKey) {
    return !e.altKey && !e.shiftKey && e.code === "KeyC" ? "copy-result" : null;
  }
  if (!e.altKey) {
    return null;
  }
  // Pronunciation: Alt+P primary, Alt+Shift+P the opposite accent.
  if (e.code === "KeyP") {
    return e.shiftKey ? "play-secondary" : "play-primary";
  }
  if (e.shiftKey) {
    return null;
  }
  return ALT_ACTIONS[e.code] ?? null;
}
