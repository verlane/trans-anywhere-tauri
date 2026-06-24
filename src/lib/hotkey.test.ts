import { describe, it, expect } from "vitest";
import type { KeyboardEvent } from "react";
import { EDITOR_KEY, isTranslateAltKey, isNewlineKey } from "./hotkey";

interface Mods {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
}

/** Build a minimal keydown stub carrying only the fields the matchers read. */
function ev(key: string, mods: Mods = {}): KeyboardEvent {
  return {
    key,
    ctrlKey: !!mods.ctrl,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
    metaKey: !!mods.meta,
  } as unknown as KeyboardEvent;
}

describe("EDITOR_KEY labels", () => {
  it("match the bindings the matchers accept", () => {
    expect(EDITOR_KEY.search).toBe("Enter");
    expect(EDITOR_KEY.translateAlt).toBe("Ctrl+Enter");
    expect(EDITOR_KEY.newline).toBe("Shift+Enter");
  });
});

describe("isTranslateAltKey", () => {
  it("matches Ctrl+Enter", () => {
    expect(isTranslateAltKey(ev("Enter", { ctrl: true }))).toBe(true);
  });

  it("matches Cmd+Enter (metaKey) for macOS", () => {
    expect(isTranslateAltKey(ev("Enter", { meta: true }))).toBe(true);
  });

  it("rejects plain Enter", () => {
    expect(isTranslateAltKey(ev("Enter"))).toBe(false);
  });

  it("rejects Shift+Enter (that is newline)", () => {
    expect(isTranslateAltKey(ev("Enter", { shift: true }))).toBe(false);
  });

  it("rejects when Shift is also held", () => {
    expect(isTranslateAltKey(ev("Enter", { ctrl: true, shift: true }))).toBe(false);
  });

  it("rejects when Alt is also held", () => {
    expect(isTranslateAltKey(ev("Enter", { ctrl: true, alt: true }))).toBe(false);
  });

  it("rejects Ctrl with a non-Enter key", () => {
    expect(isTranslateAltKey(ev("a", { ctrl: true }))).toBe(false);
  });
});

describe("isNewlineKey", () => {
  it("matches Shift+Enter", () => {
    expect(isNewlineKey(ev("Enter", { shift: true }))).toBe(true);
  });

  it("rejects plain Enter", () => {
    expect(isNewlineKey(ev("Enter"))).toBe(false);
  });

  it("rejects Ctrl+Enter (that is translate)", () => {
    expect(isNewlineKey(ev("Enter", { ctrl: true }))).toBe(false);
  });

  it("rejects when Alt is also held", () => {
    expect(isNewlineKey(ev("Enter", { shift: true, alt: true }))).toBe(false);
  });

  it("rejects when Ctrl is also held", () => {
    expect(isNewlineKey(ev("Enter", { shift: true, ctrl: true }))).toBe(false);
  });

  it("rejects Shift with a non-Enter key", () => {
    expect(isNewlineKey(ev("a", { shift: true }))).toBe(false);
  });
});

describe("matcher mutual exclusivity", () => {
  it("Ctrl+Enter is translate, not newline", () => {
    const e = ev("Enter", { ctrl: true });
    expect(isTranslateAltKey(e)).toBe(true);
    expect(isNewlineKey(e)).toBe(false);
  });

  it("Shift+Enter is newline, not translate", () => {
    const e = ev("Enter", { shift: true });
    expect(isNewlineKey(e)).toBe(true);
    expect(isTranslateAltKey(e)).toBe(false);
  });
});
