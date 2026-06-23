import { describe, it, expect } from "vitest";
import { INITIAL_NAV, pushNav, back, forward, canBack, canForward } from "./navStack";

describe("pushNav", () => {
  it("adds the first entry and points at it", () => {
    expect(pushNav(INITIAL_NAV, "love")).toEqual({ entries: ["love"], index: 0 });
  });

  it("appends and advances the pointer", () => {
    const s = pushNav(pushNav(INITIAL_NAV, "a"), "b");
    expect(s).toEqual({ entries: ["a", "b"], index: 1 });
  });

  it("ignores a consecutive duplicate of the current entry", () => {
    const s = pushNav(INITIAL_NAV, "a");
    expect(pushNav(s, "a")).toBe(s);
  });

  it("trims and ignores blank terms", () => {
    expect(pushNav(INITIAL_NAV, "  cat  ")).toEqual({ entries: ["cat"], index: 0 });
    const s = pushNav(INITIAL_NAV, "a");
    expect(pushNav(s, "   ")).toBe(s);
  });

  it("truncates forward history when pushing after going back", () => {
    const s = { entries: ["a", "b", "c"], index: 0 };
    expect(pushNav(s, "d")).toEqual({ entries: ["a", "d"], index: 1 });
  });
});

describe("back / forward", () => {
  it("back returns the previous entry and moves the pointer", () => {
    const s = { entries: ["a", "b"], index: 1 };
    expect(back(s)).toEqual({ state: { entries: ["a", "b"], index: 0 }, term: "a" });
  });

  it("forward returns the next entry and moves the pointer", () => {
    const s = { entries: ["a", "b"], index: 0 };
    expect(forward(s)).toEqual({ state: { entries: ["a", "b"], index: 1 }, term: "b" });
  });

  it("returns null at the boundaries", () => {
    expect(back({ entries: ["a"], index: 0 })).toBeNull();
    expect(forward({ entries: ["a"], index: 0 })).toBeNull();
  });
});

describe("canBack / canForward", () => {
  it("reflects pointer position", () => {
    expect(canBack({ entries: ["a", "b"], index: 1 })).toBe(true);
    expect(canBack({ entries: ["a", "b"], index: 0 })).toBe(false);
    expect(canForward({ entries: ["a", "b"], index: 0 })).toBe(true);
    expect(canForward({ entries: ["a", "b"], index: 1 })).toBe(false);
  });
});
