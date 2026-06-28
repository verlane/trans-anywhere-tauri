import { describe, it, expect } from "vitest";
import { splitWords, keywordRegex } from "./highlight";

/** All substrings of `text` that the keyword regex colors. */
function matches(text: string, kw: string, inflect: boolean): string[] {
  return [...text.matchAll(keywordRegex(kw, inflect))].map((m) => m[0]);
}

describe("splitWords", () => {
  it("splits a plain English phrase into word and gap tokens", () => {
    expect(splitWords("an IQ test")).toEqual([
      { text: "an", isWord: true },
      { text: " ", isWord: false },
      { text: "IQ", isWord: true },
      { text: " ", isWord: false },
      { text: "test", isWord: true },
    ]);
  });

  it("treats Korean and punctuation as non-word gaps", () => {
    expect(splitWords("개인 individual")).toEqual([
      { text: "개인 ", isWord: false },
      { text: "individual", isWord: true },
    ]);
  });

  it("keeps apostrophes and hyphens inside a single word", () => {
    expect(splitWords("don't well-known")).toEqual([
      { text: "don't", isWord: true },
      { text: " ", isWord: false },
      { text: "well-known", isWord: true },
    ]);
  });

  it("does not treat IPA / non-ASCII letters as clickable words", () => {
    expect(splitWords("ˈɪndɪ")).toEqual([{ text: "ˈɪndɪ", isWord: false }]);
  });

  it("separates trailing digits and brackets from the word", () => {
    expect(splitWords("a test[검사]")).toEqual([
      { text: "a", isWord: true },
      { text: " ", isWord: false },
      { text: "test", isWord: true },
      { text: "[검사]", isWord: false },
    ]);
  });

  it("returns an empty array for an empty string", () => {
    expect(splitWords("")).toEqual([]);
  });
});

describe("keywordRegex", () => {
  it("matches plural / 3rd-person -s and -es when inflected", () => {
    expect(matches("I borrow, she borrows often", "borrow", true)).toEqual(["borrow", "borrows"]);
    expect(matches("one box, two boxes", "box", true)).toEqual(["box", "boxes"]);
    expect(matches("watch the watches", "watch", true)).toEqual(["watch", "watches"]);
  });

  it("turns a consonant+y keyword into -ies", () => {
    expect(matches("carry and carries", "carry", true)).toEqual(["carry", "carries"]);
  });

  it("keeps a plain -s for a vowel+y keyword", () => {
    expect(matches("play, plays", "play", true)).toEqual(["play", "plays"]);
  });

  it("does NOT color -ed / -ing forms (those are conjugation-colored)", () => {
    expect(matches("borrow borrowed borrowing", "borrow", true)).toEqual(["borrow"]);
  });

  it("does not over-match a shorter unrelated word", () => {
    expect(matches("we use us daily", "use", true)).toEqual(["use"]);
    expect(matches("a user uses it", "use", true)).toEqual(["uses"]);
  });

  it("matches a conjugation form exactly when not inflected", () => {
    expect(matches("borrowed borroweds", "borrowed", false)).toEqual(["borrowed"]);
  });

  it("matches a non-ASCII keyword as a substring", () => {
    expect(matches("辞書と辞書", "辞書", false)).toEqual(["辞書", "辞書"]);
  });
});
