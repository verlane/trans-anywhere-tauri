import { describe, it, expect } from "vitest";
import { groupFavorites } from "./groupFavorites";
import type { FavoriteItem } from "./favorites";

const fav = (term: string): FavoriteItem => ({ term, gloss: "" });

describe("groupFavorites", () => {
  it("splits words into language sections in EN > JA > KO > Other order", () => {
    const groups = groupFavorites(["사전", "present", "辞書", "@#"].map(fav));
    expect(groups.map((g) => g.lang)).toEqual(["en", "ja", "ko", "other"]);
  });

  it("labels each section", () => {
    const groups = groupFavorites(["present", "辞書", "사전", "@#"].map(fav));
    expect(groups.map((g) => g.label)).toEqual(["English", "日本語", "한국어", "기타"]);
  });

  it("preserves the original (most-recent-first) order within a group", () => {
    const groups = groupFavorites(["banana", "apple"].map(fav));
    expect(groups[0].items.map((i) => i.term)).toEqual(["banana", "apple"]);
  });

  it("keeps each item's gloss", () => {
    const groups = groupFavorites([{ term: "present", gloss: "현재의" }]);
    expect(groups[0].items[0].gloss).toBe("현재의");
  });

  it("omits sections that have no words", () => {
    const groups = groupFavorites(["apple", "banana"].map(fav));
    expect(groups).toHaveLength(1);
    expect(groups[0].lang).toBe("en");
  });

  it("returns an empty array for an empty list", () => {
    expect(groupFavorites([])).toEqual([]);
  });
});
