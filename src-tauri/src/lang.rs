//! Language detection ported from the v1 BUtil.ahk regex helpers.
//! Uses Unicode code-point ranges instead of a regex engine to avoid an extra dependency.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Ko,
    Ja,
    En,
    Other,
}

impl Lang {
    /// ISO-ish code used as a translation source/target language.
    pub fn code(self) -> &'static str {
        match self {
            Lang::Ko => "ko",
            Lang::Ja => "ja",
            Lang::En => "en",
            Lang::Other => "other",
        }
    }
}

fn is_korean_char(c: char) -> bool {
    matches!(c, '\u{AC00}'..='\u{D7A3}' | '\u{3131}'..='\u{3163}')
}

fn is_japanese_char(c: char) -> bool {
    // Hiragana, Katakana, CJK unified ideographs (kanji)
    matches!(c, '\u{3040}'..='\u{309F}' | '\u{30A0}'..='\u{30FF}' | '\u{4E00}'..='\u{9FAF}')
}

pub fn has_korean(text: &str) -> bool {
    text.chars().any(is_korean_char)
}

pub fn has_japanese(text: &str) -> bool {
    text.chars().any(is_japanese_char)
}

/// Mirrors v1 IsEnglish: only ASCII letters, digits and a few word symbols.
pub fn is_english(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || " .'\";:`-".contains(c))
}

/// Detect the dominant language of the input. Korean wins over Japanese because
/// kanji ranges overlap conceptually but hangul is unambiguous.
pub fn detect(text: &str) -> Lang {
    if has_korean(text) {
        Lang::Ko
    } else if has_japanese(text) {
        Lang::Ja
    } else if is_english(text) {
        Lang::En
    } else {
        Lang::Other
    }
}

/// Mirrors v1 IsSentence: more than one whitespace-separated token, a line break,
/// or a long Japanese string.
pub fn is_sentence(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.split_whitespace().count() > 1 {
        return true;
    }
    if trimmed.contains('\n') {
        return true;
    }
    has_japanese(trimmed) && trimmed.chars().count() > 10
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_single_english_word() {
        assert_eq!(detect("present"), Lang::En);
        assert!(!is_sentence("present"));
    }

    #[test]
    fn detects_korean() {
        assert_eq!(detect("사전"), Lang::Ko);
    }

    #[test]
    fn lang_code_maps_each_variant() {
        assert_eq!(Lang::Ko.code(), "ko");
        assert_eq!(Lang::Ja.code(), "ja");
        assert_eq!(Lang::En.code(), "en");
        assert_eq!(Lang::Other.code(), "other");
    }

    #[test]
    fn detects_japanese() {
        assert_eq!(detect("辞書"), Lang::Ja);
    }

    #[test]
    fn flags_multi_word_as_sentence() {
        assert!(is_sentence("did you push the changes"));
    }

    #[test]
    fn flags_long_japanese_as_sentence() {
        assert!(is_sentence("これはとても長い日本語の文章です"));
    }
}
