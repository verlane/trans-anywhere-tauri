import { describe, it, expect } from "vitest";
import { summaryLine } from "./preview";

describe("summaryLine", () => {
  it("returns the first non-empty line (the summary gloss)", () => {
    const def = "조사, 살피다, 조망하다\nsur·vey 명[...]\n1. (설문) 조사";
    expect(summaryLine(def)).toBe("조사, 살피다, 조망하다");
  });

  it("skips leading blank lines", () => {
    expect(summaryLine("\n\n  사랑\n사랑하다")).toBe("사랑");
  });

  it("trims surrounding whitespace", () => {
    expect(summaryLine("   조사   \nnext")).toBe("조사");
  });

  it("returns an empty string for an empty definition", () => {
    expect(summaryLine("")).toBe("");
  });

  it("returns an empty string when only whitespace", () => {
    expect(summaryLine("   \n\t\n  ")).toBe("");
  });
});
