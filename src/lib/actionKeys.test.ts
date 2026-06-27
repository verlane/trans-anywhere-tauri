import { describe, it, expect } from "vitest";
import { resolveActionKey, ACTION_KEY, type ActionKeyEvent } from "./actionKeys";

interface Mods {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  composing?: boolean;
}

/** Build a minimal keydown stub carrying only the fields the resolver reads. */
function ev(code: string, mods: Mods = {}): ActionKeyEvent {
  return {
    code,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
    metaKey: !!mods.meta,
    isComposing: !!mods.composing,
  };
}

describe("ACTION_KEY labels", () => {
  it("describe the bindings the resolver accepts", () => {
    expect(ACTION_KEY.playPrimary).toBe("Alt+P");
    expect(ACTION_KEY.playSecondary).toBe("Alt+Shift+P");
    expect(ACTION_KEY.copy).toBe("Alt+C / Ctrl+C");
    expect(ACTION_KEY.toggleFavorite).toBe("Alt+D");
    expect(ACTION_KEY.refresh).toBe("Alt+R");
    expect(ACTION_KEY.openFavorites).toBe("Alt+B");
    expect(ACTION_KEY.openSettings).toBe("Alt+S");
  });
});

describe("resolveActionKey — Alt bindings", () => {
  it("maps Alt+P to the primary pronunciation", () => {
    expect(resolveActionKey(ev("KeyP", { alt: true }))).toBe("play-primary");
  });

  it("maps Alt+Shift+P to the secondary pronunciation", () => {
    expect(resolveActionKey(ev("KeyP", { alt: true, shift: true }))).toBe("play-secondary");
  });

  it("maps Alt+C to copy", () => {
    expect(resolveActionKey(ev("KeyC", { alt: true }))).toBe("copy-result");
  });

  it("maps Alt+D to favorite toggle", () => {
    expect(resolveActionKey(ev("KeyD", { alt: true }))).toBe("toggle-favorite");
  });

  it("maps Alt+R to refresh", () => {
    expect(resolveActionKey(ev("KeyR", { alt: true }))).toBe("refresh");
  });

  it("maps Alt+B to opening the word book", () => {
    expect(resolveActionKey(ev("KeyB", { alt: true }))).toBe("open-favorites");
  });

  it("maps Alt+S to opening settings", () => {
    expect(resolveActionKey(ev("KeyS", { alt: true }))).toBe("open-settings");
  });
});

describe("resolveActionKey — Ctrl+C copy alias", () => {
  it("maps a bare Ctrl+C to copy", () => {
    expect(resolveActionKey(ev("KeyC", { ctrl: true }))).toBe("copy-result");
  });

  it("rejects Ctrl+Shift+C", () => {
    expect(resolveActionKey(ev("KeyC", { ctrl: true, shift: true }))).toBeNull();
  });

  it("rejects Ctrl+Alt+C", () => {
    expect(resolveActionKey(ev("KeyC", { ctrl: true, alt: true }))).toBeNull();
  });
});

describe("resolveActionKey — rejections", () => {
  it("ignores keys while an IME is composing", () => {
    expect(resolveActionKey(ev("KeyP", { alt: true, composing: true }))).toBeNull();
  });

  it("ignores a bare letter with no modifier", () => {
    expect(resolveActionKey(ev("KeyP"))).toBeNull();
  });

  it("does not claim the existing Alt+H / Alt+L navigation keys", () => {
    expect(resolveActionKey(ev("KeyH", { alt: true }))).toBeNull();
    expect(resolveActionKey(ev("KeyL", { alt: true }))).toBeNull();
  });

  it("does not claim the Alt+J / Alt+K scroll keys", () => {
    expect(resolveActionKey(ev("KeyJ", { alt: true }))).toBeNull();
    expect(resolveActionKey(ev("KeyK", { alt: true }))).toBeNull();
  });

  it("rejects Alt+Shift on a non-P action key", () => {
    expect(resolveActionKey(ev("KeyC", { alt: true, shift: true }))).toBeNull();
    expect(resolveActionKey(ev("KeyS", { alt: true, shift: true }))).toBeNull();
  });

  it("rejects when Meta (Cmd) is held", () => {
    expect(resolveActionKey(ev("KeyS", { alt: true, meta: true }))).toBeNull();
    expect(resolveActionKey(ev("KeyC", { meta: true }))).toBeNull();
  });

  it("rejects Ctrl on a non-copy action key", () => {
    expect(resolveActionKey(ev("KeyS", { ctrl: true }))).toBeNull();
    expect(resolveActionKey(ev("KeyR", { ctrl: true }))).toBeNull();
  });
});
