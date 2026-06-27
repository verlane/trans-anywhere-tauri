import { describe, it, expect } from "vitest";
import { resolveEscAction, type EscState } from "./esc";

const NOTHING_ACTIVE: EscState = {
  settingsOpen: false,
  favoritesOpen: false,
  dropdownOpen: false,
};

describe("resolveEscAction", () => {
  it("minimizes the window when nothing is active", () => {
    expect(resolveEscAction(NOTHING_ACTIVE)).toBe("minimize");
  });

  it("closes the settings panel before anything else", () => {
    const state: EscState = {
      settingsOpen: true,
      favoritesOpen: true,
      dropdownOpen: true,
    };
    expect(resolveEscAction(state)).toBe("close-settings");
  });

  it("closes the favorites panel when settings is closed", () => {
    const state: EscState = {
      ...NOTHING_ACTIVE,
      favoritesOpen: true,
      dropdownOpen: true,
    };
    expect(resolveEscAction(state)).toBe("close-favorites");
  });

  it("dismisses the dropdown when no panel is open", () => {
    const state: EscState = { ...NOTHING_ACTIVE, dropdownOpen: true };
    expect(resolveEscAction(state)).toBe("dismiss-dropdown");
  });
});
