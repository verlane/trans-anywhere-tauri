import { describe, it, expect } from "vitest";
import { groupFavorites } from "./groupFavorites";

describe("groupFavorites", () => {
  it("splits words into language sections in EN > JA > KO > Other order", () => {
    const groups = groupFavorites(["사전", "present", "辞書", "@#"]);
    expect(groups.map((g) => g.lang)).toEqual(["en", "ja", "ko", "other"]);
  });

  it("labels each section", () => {
    const groups = groupFavorites(["present", "辞書", "사전", "@#"]);
    expect(groups.map((g) => g.label)).toEqual(["English", "日本語", "한국어", "기타"]);
  });

  it("preserves the original (most-recent-first) order within a group", () => {
    const groups = groupFavorites(["banana", "apple"]);
    expect(groups[0].items).toEqual(["banana", "apple"]);
  });

  it("omits sections that have no words", () => {
    const groups = groupFavorites(["apple", "banana"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].lang).toBe("en");
  });

  it("returns an empty array for an empty list", () => {
    expect(groupFavorites([])).toEqual([]);
  });
});
