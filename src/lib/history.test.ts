import { describe, it, expect } from "vitest";
import { addTerm, removeTerm, HISTORY_MAX } from "./history";

describe("addTerm", () => {
  it("prepends the newest term", () => {
    expect(addTerm(["b", "c"], "a")).toEqual(["a", "b", "c"]);
  });

  it("moves a repeated term to the front instead of duplicating", () => {
    expect(addTerm(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
  });

  it("trims whitespace and ignores blank terms", () => {
    expect(addTerm(["a"], "  b  ")).toEqual(["b", "a"]);
    expect(addTerm(["a"], "   ")).toEqual(["a"]);
  });

  it("keeps up to 20 recent terms", () => {
    // 최근 검색어는 20개까지 보관/표시한다.
    expect(HISTORY_MAX).toBe(20);
    const full = Array.from({ length: 20 }, (_, i) => `word${i}`);
    const next = addTerm(full, "new");
    expect(next).toHaveLength(20);
    expect(next[0]).toBe("new");
    expect(next).not.toContain("word19"); // 가장 오래된 항목이 밀려난다
  });
});

describe("removeTerm", () => {
  it("removes only the matching term", () => {
    expect(removeTerm(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("returns the list unchanged when the term is absent", () => {
    expect(removeTerm(["a", "b"], "x")).toEqual(["a", "b"]);
  });
});
