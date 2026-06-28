import { describe, it, expect } from "vitest";
import { prioritizeRecent } from "./rankSuggest";

describe("prioritizeRecent", () => {
  it("moves a recently searched word to the top", () => {
    const suggestions = ["present", "pretend", "prevent"];
    const recent = ["prevent"];
    expect(prioritizeRecent("pre", suggestions, recent)).toEqual([
      "prevent",
      "present",
      "pretend",
    ]);
  });

  it("keeps recent words in most-recent-first order", () => {
    const suggestions = ["present", "pretend", "prevent"];
    const recent = ["prevent", "present"];
    expect(prioritizeRecent("pre", suggestions, recent)).toEqual([
      "prevent",
      "present",
      "pretend",
    ]);
  });

  it("adds a matching recent word even when it is absent from the suggestions", () => {
    // 'di' matches many words, so the backend cut 'dismiss' from its top-N list.
    const suggestions = ["dial", "diamond"];
    const recent = ["dismiss"];
    expect(prioritizeRecent("di", suggestions, recent)).toEqual([
      "dismiss",
      "dial",
      "diamond",
    ]);
  });

  it("adds a matching recent word when there are no suggestions at all", () => {
    expect(prioritizeRecent("di", [], ["dismiss"])).toEqual(["dismiss"]);
  });

  it("ignores recent words that do not match the query", () => {
    const suggestions = ["present", "pretend"];
    const recent = ["apple", "prevent"];
    // 'apple' fails the anchored match against 'pre'; 'prevent' is promoted/added.
    expect(prioritizeRecent("pre", suggestions, recent)).toEqual([
      "prevent",
      "present",
      "pretend",
    ]);
  });

  it("matches by anchored subsequence, like the backend autocomplete", () => {
    const suggestions = ["dial"];
    const recent = ["dismiss"];
    // d..s..m appears in order in 'dismiss' after the anchored first char.
    expect(prioritizeRecent("dsm", suggestions, recent)).toEqual(["dismiss", "dial"]);
  });

  it("requires the first character to match (anchored)", () => {
    const suggestions = ["present"];
    const recent = ["represent"];
    // 'represent' does not start with 'p', so it is not added.
    expect(prioritizeRecent("pre", suggestions, recent)).toEqual(["present"]);
  });

  it("matches case-insensitively but preserves each word's casing", () => {
    const suggestions = ["Present", "pretend"];
    const recent = ["PREVENT"];
    expect(prioritizeRecent("pre", suggestions, recent)).toEqual([
      "PREVENT",
      "Present",
      "pretend",
    ]);
  });

  it("returns suggestions unchanged when there are no recent words", () => {
    const suggestions = ["present", "pretend"];
    expect(prioritizeRecent("pre", suggestions, [])).toEqual(["present", "pretend"]);
  });

  it("does not mutate the input arrays", () => {
    const suggestions = ["present", "pretend", "prevent"];
    const recent = ["prevent"];
    const suggestionsCopy = [...suggestions];
    const recentCopy = [...recent];
    prioritizeRecent("pre", suggestions, recent);
    expect(suggestions).toEqual(suggestionsCopy);
    expect(recent).toEqual(recentCopy);
  });

  it("does not duplicate a word that appears in both lists", () => {
    const suggestions = ["present", "pretend", "prevent"];
    const recent = ["pretend"];
    const result = prioritizeRecent("pre", suggestions, recent);
    expect(result).toHaveLength(3);
    expect(result.filter((w) => w === "pretend")).toHaveLength(1);
  });

  it("promotes nothing for an empty query, leaving suggestions as-is", () => {
    expect(prioritizeRecent("", ["present"], ["prevent"])).toEqual(["present"]);
  });
});
