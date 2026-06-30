import { describe, it, expect } from "vitest";
import { toggleFavorite, isFavorite, glossLine, normalizeFavorites } from "./favorites";

describe("toggleFavorite", () => {
  it("adds a new term with its gloss to the front (most-recent first)", () => {
    expect(toggleFavorite([{ term: "a", gloss: "" }], "b", "the meaning")).toEqual([
      { term: "b", gloss: "the meaning" },
      { term: "a", gloss: "" },
    ]);
  });

  it("removes a term that is already saved (matched by term)", () => {
    const items = [
      { term: "b", gloss: "x" },
      { term: "a", gloss: "y" },
    ];
    expect(toggleFavorite(items, "b")).toEqual([{ term: "a", gloss: "y" }]);
  });

  it("adds to an empty list with an empty gloss by default", () => {
    expect(toggleFavorite([], "test")).toEqual([{ term: "test", gloss: "" }]);
  });

  it("trims the term and treats whitespace-padded terms as equal", () => {
    expect(toggleFavorite([{ term: "test", gloss: "" }], "  test  ")).toEqual([]);
  });

  it("ignores blank terms", () => {
    const items = [{ term: "a", gloss: "" }];
    expect(toggleFavorite(items, "   ")).toEqual(items);
  });

  it("caps an overly long gloss", () => {
    const long = "x".repeat(200);
    const [first] = toggleFavorite([], "word", long);
    expect(first.gloss.length).toBe(120);
  });
});

describe("isFavorite", () => {
  it("returns true when the trimmed term is present", () => {
    expect(isFavorite([{ term: "test", gloss: "" }], " test ")).toBe(true);
  });

  it("returns false when absent", () => {
    expect(isFavorite([{ term: "a", gloss: "" }], "c")).toBe(false);
  });
});

describe("glossLine", () => {
  it("takes the first non-empty line, trimmed", () => {
    expect(glossLine("바꾸다, 변하다\n\n2. 고치다")).toBe("바꾸다, 변하다");
    expect(glossLine("\n  돌아가다\n1. ...")).toBe("돌아가다");
  });

  it("returns an empty string for blank input", () => {
    expect(glossLine("")).toBe("");
    expect(glossLine("   \n  ")).toBe("");
  });

  it("caps the line length", () => {
    expect(glossLine("y".repeat(200)).length).toBe(120);
  });
});

describe("normalizeFavorites", () => {
  it("migrates the legacy string[] format", () => {
    expect(normalizeFavorites(["apple", "banana"])).toEqual([
      { term: "apple", gloss: "" },
      { term: "banana", gloss: "" },
    ]);
  });

  it("keeps well-formed items and fills a missing gloss", () => {
    expect(normalizeFavorites([{ term: "present", gloss: "현재의" }, { term: "run" }])).toEqual([
      { term: "present", gloss: "현재의" },
      { term: "run", gloss: "" },
    ]);
  });

  it("drops malformed entries", () => {
    expect(normalizeFavorites([{ gloss: "x" }, null, 42, { term: 5 }, "ok"])).toEqual([
      { term: "ok", gloss: "" },
    ]);
  });

  it("returns an empty array for non-array input", () => {
    expect(normalizeFavorites(null)).toEqual([]);
    expect(normalizeFavorites("nope")).toEqual([]);
    expect(normalizeFavorites(undefined)).toEqual([]);
  });
});
