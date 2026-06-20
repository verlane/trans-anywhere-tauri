//! Naver English-Korean dictionary scraper ported from v1 Class_NaverDic.ahk.
//! Two-step flow: search -> entryId -> entry detail JSON, then build a readable
//! definition string and extract the pronunciation MP3 url.
//! Isolated here so the unofficial endpoints/parsing can be swapped easily.

use serde_json::Value;

const REFERER: &str = "https://en.dict.naver.com/";
const SEARCH: &str = "https://en.dict.naver.com/api3/enko/search";
const ENTRY: &str = "https://en.dict.naver.com/api/platform/enko/entry";

#[derive(Debug, Clone)]
pub struct NaverResult {
    pub definition: String,
    pub pron_us_url: Option<String>,
    pub pron_uk_url: Option<String>,
}

async fn get_json(url: &str) -> anyhow::Result<Value> {
    let body = crate::http::CLIENT
        .get(url)
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await?
        .text()
        .await?;
    Ok(serde_json::from_str(&body)?)
}

/// Strip simple `<tag>` html markup and trim, mirroring v1 AppendString.
fn clean(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '<' => {
                // Only treat `<letter...>` / `</letter...>` as a tag, matching the v1 regex.
                let is_tag = matches!(chars.peek(), Some(n) if n.is_ascii_alphabetic() || *n == '/');
                if is_tag {
                    in_tag = true;
                } else {
                    out.push(c);
                }
            }
            '>' if in_tag => in_tag = false,
            _ if in_tag => {}
            _ => out.push(c),
        }
    }
    out.trim().to_string()
}

fn append(buf: &mut String, text: &str, prefix: &str) {
    let cleaned = clean(text);
    if !cleaned.is_empty() {
        buf.push_str(prefix);
        buf.push_str(&cleaned);
    }
}

/// Naver returns numeric fields as JSON strings ("11") in some places and as
/// numbers elsewhere; accept both.
fn as_int(v: &Value) -> Option<i64> {
    v.as_i64().or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))
}

fn pron_label(pron_type: &str) -> &'static str {
    match pron_type {
        "A" => "미",
        "E" => "영",
        "N" => "명",
        "V" => "동",
        "AJ" => "형",
        _ => "",
    }
}

/// Build the readable definition block from the entry detail JSON.
fn build_definition(entry: &Value) -> String {
    let mut out = String::new();

    if let Some(primary) = entry.get("primary_mean").and_then(Value::as_str) {
        append(&mut out, &primary.replace("|||", ", "), "");
    }

    let member = entry.pointer("/members/0");
    if let Some(name) = member.and_then(|m| m.get("show_full_name")).and_then(Value::as_str) {
        append(&mut out, name, "\n\n");
    }

    // Pronunciation symbols, e.g. " 동[prɪˈzent]".
    if let Some(prons) = member.and_then(|m| m.get("prons")).and_then(Value::as_array) {
        let mut syms = String::new();
        for p in prons {
            let ty = p.get("pron_type").and_then(Value::as_str).unwrap_or("");
            let sym = p.get("pron_symbol").and_then(Value::as_str).unwrap_or("");
            if !sym.is_empty() {
                syms.push_str(&format!(" {}[{}]", pron_label(ty), sym));
            }
        }
        append(&mut out, syms.trim_start(), " ");
    }

    // Conjugations: past, past participle, present participle (tense_type 11/12/13).
    if let Some(conjs) = entry.get("conjs").and_then(Value::as_array) {
        let mut tenses = String::new();
        for c in conjs {
            let tense = c.get("tense_type").and_then(as_int).unwrap_or(0);
            let content = c.get("conj_content").and_then(Value::as_str).unwrap_or("");
            if matches!(tense, 11 | 12 | 13) && !content.is_empty() {
                tenses.push_str(&format!(" - {content}"));
            }
        }
        append(&mut out, tenses.trim_start_matches(" - "), "\n");
    }

    // Numbered meanings with the first example and its translation.
    if let Some(means) = entry.get("means").and_then(Value::as_array) {
        let mut block = String::new();
        let mut no = 1;
        for m in means {
            let origin = m.get("origin_mean").and_then(Value::as_str).unwrap_or("");
            if origin.is_empty() {
                continue;
            }
            let prefix = if no == 1 { "\n" } else { "\n\n" };
            append(&mut block, &format!("{no}. {origin}"), prefix);
            if let Some(ex) = m.pointer("/examples/0/origin_example").and_then(Value::as_str) {
                append(&mut block, ex, "\n  ");
            }
            if let Some(tr) = m
                .pointer("/examples/0/translations/0/origin_translation")
                .and_then(Value::as_str)
            {
                append(&mut block, tr, "\n  ");
            }
            no += 1;
        }
        append(&mut out, &block, "\n");
    }

    out.trim().to_string()
}

/// Look up an English word and return its Korean definition + pronunciation url.
pub async fn english_to_korean(word: &str) -> anyhow::Result<Option<NaverResult>> {
    let search_url = format!("{SEARCH}?range=word&query={}", urlencoding::encode(word));
    let search = get_json(&search_url).await?;

    let entry_id = search
        .pointer("/searchResultMap/searchResultListMap/WORD/items/0/entryId")
        .and_then(|v| v.as_str().map(String::from).or_else(|| v.as_i64().map(|n| n.to_string())));

    let Some(entry_id) = entry_id else {
        return Ok(None);
    };

    let entry_url = format!("{ENTRY}?entryId={entry_id}");
    let detail = get_json(&entry_url).await?;
    let entry = detail.get("entry").unwrap_or(&Value::Null);

    let definition = build_definition(entry);
    if definition.is_empty() {
        return Ok(None);
    }

    let (pron_us_url, pron_uk_url) = extract_pron_urls(entry);

    Ok(Some(NaverResult {
        definition,
        pron_us_url,
        pron_uk_url,
    }))
}

/// Prefer the female recording, fall back to the male one.
fn pron_file(p: &Value) -> Option<String> {
    ["female_pron_file", "male_pron_file"]
        .iter()
        .find_map(|k| p.get(*k).and_then(Value::as_str).filter(|s| !s.is_empty()))
        .map(String::from)
}

/// Pull the first US and UK pronunciation urls. Naver tags US audio as "A" or
/// "C" (general American) depending on the word, and UK audio as "E".
fn extract_pron_urls(entry: &Value) -> (Option<String>, Option<String>) {
    let mut us = None;
    let mut uk = None;
    if let Some(prons) = entry.pointer("/members/0/prons").and_then(Value::as_array) {
        for p in prons {
            match p.get("pron_type").and_then(Value::as_str).unwrap_or("") {
                "A" | "C" if us.is_none() => us = pron_file(p),
                "E" if uk.is_none() => uk = pron_file(p),
                _ => {}
            }
        }
    }
    (us, uk)
}

/// Download a pronunciation MP3 by url.
pub async fn download_pron(url: &str) -> anyhow::Result<Vec<u8>> {
    let bytes = crate::http::CLIENT
        .get(url)
        .header(reqwest::header::REFERER, REFERER)
        .send()
        .await?
        .bytes()
        .await?;
    Ok(bytes.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_strips_tags() {
        assert_eq!(clean("<b>hello</b>"), "hello");
        assert_eq!(clean("  spaced  "), "spaced");
        // A bare "<" that is not a tag should survive.
        assert_eq!(clean("a < b"), "a < b");
    }

    #[test]
    fn build_definition_from_minimal_entry() {
        let entry = serde_json::json!({
            "primary_mean": "현재의|||선물",
            "members": [{ "show_full_name": "pre·sent", "prons": [{ "pron_type": "V", "pron_symbol": "prɪˈzent" }] }],
            "conjs": [{ "tense_type": "11", "conj_content": "presented" }],
            "means": [{ "origin_mean": "현재의", "examples": [{ "origin_example": "at present", "translations": [{ "origin_translation": "현재" }] }] }]
        });
        let def = build_definition(&entry);
        assert!(def.contains("현재의, 선물"));
        assert!(def.contains("pre·sent"));
        assert!(def.contains("동[prɪˈzent]"));
        assert!(def.contains("presented"));
        assert!(def.contains("1. 현재의"));
        assert!(def.contains("at present"));
    }
}
