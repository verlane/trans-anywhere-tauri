import { describe, it, expect } from "vitest";
import { toggleFavorite, isFavorite } from "./favorites";

describe("toggleFavorite", () => {
  it("adds a new term to the front (most-recent first)", () => {
    expect(toggleFavorite(["a"], "b")).toEqual(["b", "a"]);
  });

  it("removes a term that is already saved", () => {
    expect(toggleFavorite(["b", "a"], "b")).toEqual(["a"]);
  });

  it("adds to an empty list", () => {
    expect(toggleFavorite([], "test")).toEqual(["test"]);
  });

  it("trims and treats whitespace-padded terms as equal", () => {
    expect(toggleFavorite(["test"], "  test  ")).toEqual([]);
  });

  it("ignores blank terms", () => {
    expect(toggleFavorite(["a"], "   ")).toEqual(["a"]);
  });
});

describe("isFavorite", () => {
  it("returns true when the trimmed term is present", () => {
    expect(isFavorite(["test"], " test ")).toBe(true);
  });

  it("returns false when absent", () => {
    expect(isFavorite(["a", "b"], "c")).toBe(false);
  });
});
