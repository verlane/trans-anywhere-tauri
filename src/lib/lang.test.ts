import { describe, it, expect } from "vitest";
import { detectLang } from "./lang";

describe("detectLang", () => {
  it("detects a plain English word", () => {
    expect(detectLang("present")).toBe("en");
  });

  it("detects Korean by hangul syllables", () => {
    expect(detectLang("사전")).toBe("ko");
  });

  it("detects Korean by jamo", () => {
    expect(detectLang("ㄱ")).toBe("ko");
  });

  it("detects Japanese kana", () => {
    expect(detectLang("かえる")).toBe("ja");
  });

  it("detects Japanese kanji-only as Japanese", () => {
    expect(detectLang("辞書")).toBe("ja");
  });

  it("prefers Korean when hangul and kanji mix", () => {
    expect(detectLang("한자漢字")).toBe("ko");
  });

  it("treats blank input as other", () => {
    expect(detectLang("   ")).toBe("other");
  });

  it("treats digits and symbols as other", () => {
    expect(detectLang("123")).toBe("en");
    expect(detectLang("@#%")).toBe("other");
  });

  it("classifies a multi-word English phrase as English", () => {
    expect(detectLang("did you push")).toBe("en");
  });
});
