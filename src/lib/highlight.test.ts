import { describe, it, expect } from "vitest";
import { splitWords } from "./highlight";

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
