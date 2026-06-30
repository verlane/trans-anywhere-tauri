/**
 * Per-word language detection, ported from the Rust `lang.rs` Unicode-range
 * helpers. Used to group saved words in the word book; mirrors the backend's
 * Ko > Ja > En > Other priority so classification stays consistent.
 */
export type Lang = "en" | "ja" | "ko" | "other";

function hasKorean(text: string): boolean {
  // Hangul syllables + compatibility jamo.
  return /[가-힣ㄱ-ㅣ]/.test(text);
}

function hasJapanese(text: string): boolean {
  // Hiragana, Katakana, CJK unified ideographs (kanji).
  return /[぀-ゟ゠-ヿ一-龯]/.test(text);
}

function isEnglish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  // Mirrors v1 IsEnglish: ASCII letters, digits and a few word symbols.
  return /^[A-Za-z0-9 .'";:`-]+$/.test(trimmed);
}

/** Detect the dominant language; hangul wins over kanji because it is unambiguous. */
export function detectLang(text: string): Lang {
  if (hasKorean(text)) {
    return "ko";
  }
  if (hasJapanese(text)) {
    return "ja";
  }
  if (isEnglish(text)) {
    return "en";
  }
  return "other";
}
