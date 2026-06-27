import { describe, it, expect } from "vitest";
import { INITIAL_NAV, pushNav, back, forward, canBack, canForward } from "./navStack";

/** Shorthand for a nav entry. */
const E = (term: string, single = false) => ({ term, single });

describe("pushNav", () => {
  it("adds the first entry and points at it", () => {
    expect(pushNav(INITIAL_NAV, "love")).toEqual({ entries: [E("love")], index: 0 });
  });

  it("appends and advances the pointer", () => {
    const s = pushNav(pushNav(INITIAL_NAV, "a"), "b");
    expect(s).toEqual({ entries: [E("a"), E("b")], index: 1 });
  });

  it("ignores a consecutive duplicate of the current entry", () => {
    const s = pushNav(INITIAL_NAV, "a");
    expect(pushNav(s, "a")).toBe(s);
  });

  it("keeps the same term with a different single flag as a distinct entry", () => {
    // 묶음(アツい)에서 그 안의 단일(アツい)로 들어가면 별개 history여야 뒤로가기가 된다.
    const s = pushNav(INITIAL_NAV, "アツい");
    const s2 = pushNav(s, "アツい", true);
    expect(s2).toEqual({ entries: [E("アツい"), E("アツい", true)], index: 1 });
  });

  it("trims and ignores blank terms", () => {
    expect(pushNav(INITIAL_NAV, "  cat  ")).toEqual({ entries: [E("cat")], index: 0 });
    const s = pushNav(INITIAL_NAV, "a");
    expect(pushNav(s, "   ")).toBe(s);
  });

  it("truncates forward history when pushing after going back", () => {
    const s = { entries: [E("a"), E("b"), E("c")], index: 0 };
    expect(pushNav(s, "d")).toEqual({ entries: [E("a"), E("d")], index: 1 });
  });
});

describe("back / forward", () => {
  it("back returns the previous entry and moves the pointer", () => {
    const s = { entries: [E("a"), E("b")], index: 1 };
    expect(back(s)).toEqual({ state: { entries: [E("a"), E("b")], index: 0 }, entry: E("a") });
  });

  it("forward returns the next entry and moves the pointer", () => {
    const s = { entries: [E("a"), E("b")], index: 0 };
    expect(forward(s)).toEqual({ state: { entries: [E("a"), E("b")], index: 1 }, entry: E("b") });
  });

  it("returns null at the boundaries", () => {
    expect(back({ entries: [E("a")], index: 0 })).toBeNull();
    expect(forward({ entries: [E("a")], index: 0 })).toBeNull();
  });
});

describe("canBack / canForward", () => {
  it("reflects pointer position", () => {
    expect(canBack({ entries: [E("a"), E("b")], index: 1 })).toBe(true);
    expect(canBack({ entries: [E("a"), E("b")], index: 0 })).toBe(false);
    expect(canForward({ entries: [E("a"), E("b")], index: 0 })).toBe(true);
    expect(canForward({ entries: [E("a"), E("b")], index: 1 })).toBe(false);
  });
});
