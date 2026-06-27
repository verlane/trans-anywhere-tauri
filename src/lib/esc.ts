/** What an Esc keypress should do, resolved in priority order. */
export type EscAction = "close-settings" | "close-favorites" | "dismiss-dropdown" | "minimize";

export interface EscState {
  /** The settings panel is open. */
  settingsOpen: boolean;
  /** The favorites (word book) panel is open. */
  favoritesOpen: boolean;
  /** An autocomplete or history dropdown is showing. */
  dropdownOpen: boolean;
}

/**
 * Decide what Esc does, by priority: an open panel closes first, then a visible
 * dropdown dismisses, and only when nothing is active does the window minimize.
 */
export function resolveEscAction({ settingsOpen, favoritesOpen, dropdownOpen }: EscState): EscAction {
  if (settingsOpen) {
    return "close-settings";
  }
  if (favoritesOpen) {
    return "close-favorites";
  }
  if (dropdownOpen) {
    return "dismiss-dropdown";
  }
  return "minimize";
}
