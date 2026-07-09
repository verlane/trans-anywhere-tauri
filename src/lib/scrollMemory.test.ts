import { describe, it, expect } from "vitest";
import { clampScrollTop } from "./scrollMemory";

describe("clampScrollTop", () => {
  it("keeps a saved position that still fits within the scrollable range", () => {
    expect(clampScrollTop(120, 400)).toBe(120);
  });

  it("clamps a saved position past the current max (e.g. list got shorter)", () => {
    expect(clampScrollTop(500, 400)).toBe(400);
  });

  it("clamps a negative saved position to zero", () => {
    expect(clampScrollTop(-30, 400)).toBe(0);
  });

  it("returns zero when the content no longer scrolls at all", () => {
    expect(clampScrollTop(120, 0)).toBe(0);
    expect(clampScrollTop(120, -10)).toBe(0);
  });
});
