//! Naver English-Korean dictionary scraper ported from v1 Class_NaverDic.ahk.
//! Two-step flow: search -> entryId -> entry detail JSON, then build a readable
//! definition string and extract the pronunciation MP3 url.
//! Isolated here so the unofficial endpoints/parsing can be swapped easily.

use serde_json::Value;

/// Which Naver dictionary to query. The two services share the same JSON shape
/// (entryId -> entry detail) but live on different hosts/paths and differ in how
/// pronunciations are exposed.
#[derive(Debug, Clone, Copy)]
pub enum Dict {
    /// English -> Korean. Pronunciations are split by accent (US / UK).
    Enko,
    /// Japanese -> Korean. No accent split; female / male recordings instead.
    Jako,
}

impl Dict {
    fn referer(self) -> &'static str {
        match self {
            Dict::Enko => "https://en.dict.naver.com/",
            Dict::Jako => "https://ja.dict.naver.com/",
        }
    }

    fn search_url(self) -> &'static str {
        match self {
            Dict::Enko => "https://en.dict.naver.com/api3/enko/search",
            Dict::Jako => "https://ja.dict.naver.com/api3/jako/search",
        }
    }

    fn entry_url(self) -> &'static str {
        match self {
            Dict::Enko => "https://en.dict.naver.com/api/platform/enko/entry",
            Dict::Jako => "https://ja.dict.naver.com/api/platform/jako/entry",
        }
    }
}

/// A dictionary result. The two pron slots map to DB columns media1/media2.
/// For Enko: `pron_us_url` = US, `pron_uk_url` = UK.
/// For Jako: `pron_us_url` = female, `pron_uk_url` = male (no accent concept).
#[derive(Debug, Clone)]
pub struct NaverResult {
    /// Canonical headword from the search hit (`handleEntry`), used as the cache
    /// key so inflected forms ("cheats" -> "cheat") collapse onto one entry. For
    /// Jako this is the reading (e.g. 走った -> はしる). Empty if Naver omits it.
    pub headword: String,
    pub definition: String,
    pub pron_us_url: Option<String>,
    pub pron_uk_url: Option<String>,
}

impl NaverResult {
    /// The cache key for this result: the lowercased headword, or `fallback`
    /// (the lowercased input word) when Naver omitted the headword.
    pub fn cache_key(&self, fallback: &str) -> String {
        let head = self.headword.trim();
        if head.is_empty() {
            fallback.to_string()
        } else {
            head.to_lowercase()
        }
    }
}

async fn get_json(url: &str, referer: &str) -> anyhow::Result<Value> {
    let body = crate::http::CLIENT
        .get(url)
        .header(reqwest::header::REFERER, referer)
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
                let is_tag =
                    matches!(chars.peek(), Some(n) if n.is_ascii_alphabetic() || *n == '/');
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
    v.as_i64()
        .or_else(|| v.as_str().and_then(|s| s.trim().parse().ok()))
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

/// How many example sentences to show per meaning. Naver often carries several;
/// v1 showed only the first, but a bounded few keep results informative without
/// flooding the panel.
const MAX_EXAMPLES_PER_MEAN: usize = 2;

/// The Korean gloss for a sense: `origin_mean`, falling back to `show_mean`.
/// Some headwords ("recap") leave both empty and carry meaning only via examples,
/// so an empty return is expected and handled by the caller.
fn meaning_gloss(mean: &Value) -> &str {
    for key in ["origin_mean", "show_mean"] {
        if let Some(s) = mean.get(key).and_then(Value::as_str) {
            if !s.trim().is_empty() {
                return s;
            }
        }
    }
    ""
}

/// Append up to `MAX_EXAMPLES_PER_MEAN` examples (with their first translation)
/// of a sense, each indented under the meaning line.
fn append_examples(block: &mut String, mean: &Value) {
    let Some(examples) = mean.get("examples").and_then(Value::as_array) else {
        return;
    };
    for ex in examples.iter().take(MAX_EXAMPLES_PER_MEAN) {
        if let Some(s) = ex.get("origin_example").and_then(Value::as_str) {
            append(block, s, "\n  ");
        }
        if let Some(t) = ex
            .pointer("/translations/0/origin_translation")
            .and_then(Value::as_str)
        {
            append(block, t, "\n  ");
        }
    }
}

/// Numbered meanings straight from the entry detail: each sense's gloss plus a
/// bounded set of examples. A sense with no gloss but with examples is still kept.
fn build_means_from_entry(means: &[Value]) -> String {
    let mut block = String::new();
    let mut no = 1;
    for m in means {
        let gloss = meaning_gloss(m);
        let has_examples = m
            .get("examples")
            .and_then(Value::as_array)
            .is_some_and(|e| !e.is_empty());
        if gloss.is_empty() && !has_examples {
            continue;
        }
        if !gloss.is_empty() {
            let prefix = if no == 1 { "\n" } else { "\n\n" };
            append(&mut block, &format!("{no}. {gloss}"), prefix);
            no += 1;
        }
        append_examples(&mut block, m);
    }
    block
}

/// The search-side `meansCollector` arrives as either a JSON array or a
/// JSON-encoded string; normalize both to a list of part-of-speech groups.
fn collector_groups(mc: &Value) -> Vec<Value> {
    match mc {
        Value::Array(groups) => groups.clone(),
        Value::String(s) => serde_json::from_str(s).unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// Numbered meanings rebuilt from the search `meansCollector`, used when the entry
/// detail carries no gloss (e.g. "recap", a cross-reference to "recapitulate").
/// Each collector item holds its gloss in `value` and one example pair.
fn build_means_from_collector(mc: &Value) -> String {
    let mut block = String::new();
    let mut no = 1;
    for group in collector_groups(mc) {
        let Some(means) = group.get("means").and_then(Value::as_array) else {
            continue;
        };
        for m in means {
            let value = m.get("value").and_then(Value::as_str).unwrap_or("");
            if clean(value).is_empty() {
                continue;
            }
            let prefix = if no == 1 { "\n" } else { "\n\n" };
            append(&mut block, &format!("{no}. {value}"), prefix);
            no += 1;
            if let Some(ex) = m.get("exampleOri").and_then(Value::as_str) {
                append(&mut block, ex, "\n  ");
            }
            if let Some(tr) = m.get("exampleTrans").and_then(Value::as_str) {
                append(&mut block, tr, "\n  ");
            }
        }
    }
    block
}

/// Build the numbered-meaning block, preferring the entry detail but falling back
/// to the search `meansCollector` when the entry carries no gloss for any sense.
fn build_means_block(entry: &Value, means_collector: Option<&Value>) -> String {
    let means = entry.get("means").and_then(Value::as_array);
    let has_gloss = means.is_some_and(|ms| ms.iter().any(|m| !meaning_gloss(m).is_empty()));
    if !has_gloss {
        if let Some(block) = means_collector.map(build_means_from_collector) {
            if !block.is_empty() {
                return block;
            }
        }
    }
    means
        .map(|ms| build_means_from_entry(ms))
        .unwrap_or_default()
}

/// Build the readable definition block from the entry detail JSON.
fn build_definition(entry: &Value, means_collector: Option<&Value>) -> String {
    let mut out = String::new();

    if let Some(primary) = entry.get("primary_mean").and_then(Value::as_str) {
        append(&mut out, &primary.replace("|||", ", "), "");
    }

    let member = entry.pointer("/members/0");
    if let Some(name) = member
        .and_then(|m| m.get("show_full_name"))
        .and_then(Value::as_str)
    {
        // For a kanji headword, Naver carries the reading in `audio_read`
        // (e.g. 愛 -> あい). Show it as "愛 [あい]"; skip when it duplicates the name.
        let reading = entry
            .get("audio_read")
            .and_then(Value::as_str)
            .filter(|r| !r.is_empty() && *r != name);
        match reading {
            Some(r) => append(&mut out, &format!("{name} [{r}]"), "\n\n"),
            None => append(&mut out, name, "\n\n"),
        }
    }

    // Pronunciation symbols, e.g. " 동[prɪˈzent]".
    if let Some(prons) = member
        .and_then(|m| m.get("prons"))
        .and_then(Value::as_array)
    {
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
            if matches!(tense, 11..=13) && !content.is_empty() {
                tenses.push_str(&format!(" - {content}"));
            }
        }
        append(&mut out, tenses.trim_start_matches(" - "), "\n");
    }

    // Numbered meanings. When the entry detail carries no gloss for any sense
    // (e.g. "recap", a cross-reference headword), fall back to the search-side
    // `meansCollector`, which still holds the gloss + examples.
    let means_block = build_means_block(entry, means_collector);
    append(&mut out, &means_block, "\n");

    out.trim().to_string()
}

/// The headword shown for a Jako search item. `handleEntry` is only the reading
/// (かえる for every homophone), so prefer the kanji surface in `expKanji`, taking
/// the first of any "·"-joined variants (帰る·還る -> 帰る) as the clickable/cache
/// key. Falls back to the reading for kana-only entries (loanwords).
fn item_headword(item: &Value) -> Option<String> {
    if let Some(kanji) = item.get("expKanji").and_then(Value::as_str) {
        let primary = clean(kanji);
        let primary = primary.split('·').next().unwrap_or("").trim();
        if !primary.is_empty() {
            return Some(primary.to_string());
        }
    }
    item.get("handleEntry")
        .and_then(Value::as_str)
        .map(clean)
        .filter(|s| !s.is_empty())
}

/// Collect up to `max` `(entryId, headword)` pairs from a search response, in
/// result order. A kana reading (かえる) returns several homophone hits here;
/// items missing a usable headword are skipped.
fn extract_search_items(search: &Value, max: usize) -> Vec<(String, String)> {
    let Some(items) = search
        .pointer("/searchResultMap/searchResultListMap/WORD/items")
        .and_then(Value::as_array)
    else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for item in items {
        if out.len() >= max {
            break;
        }
        let entry_id = item.get("entryId").and_then(|v| {
            v.as_str()
                .map(String::from)
                .or_else(|| v.as_i64().map(|n| n.to_string()))
        });
        // Skip homophones whose first kanji surface repeats (帰る·還る then 帰る),
        // so the group never shows the same headword — and its cache row — twice.
        if let (Some(id), Some(head)) = (entry_id, item_headword(item)) {
            if seen.insert(head.clone()) {
                out.push((id, head));
            }
        }
    }
    out
}

/// Fetch one entry's detail JSON and build its `NaverResult`, or `None` when the
/// entry has no usable definition.
async fn fetch_entry(entry_id: &str, headword: String, dict: Dict) -> Option<NaverResult> {
    let entry_url = format!("{}?entryId={entry_id}", dict.entry_url());
    let detail = get_json(&entry_url, dict.referer()).await.ok()?;
    let entry = detail.get("entry").unwrap_or(&Value::Null);
    let definition = build_definition(entry, None);
    if definition.is_empty() {
        return None;
    }
    let (pron_us_url, pron_uk_url) = extract_pron_urls(entry, dict);
    Some(NaverResult {
        headword,
        definition,
        pron_us_url,
        pron_uk_url,
    })
}

/// Look up a kana reading and return up to `max` homophone entries that share it
/// (かえる -> 帰る / 変える / 返る / 蛙). Entry details are fetched concurrently;
/// results keep the search (relevance) order.
pub async fn lookup_reading(
    reading: &str,
    dict: Dict,
    max: usize,
) -> anyhow::Result<Vec<NaverResult>> {
    let search_url = format!(
        "{}?range=word&query={}",
        dict.search_url(),
        urlencoding::encode(reading)
    );
    let search = get_json(&search_url, dict.referer()).await?;
    let items = extract_search_items(&search, max);

    // Fetch every entry concurrently, then await the handles in search order so
    // the grouped result keeps Naver's relevance ranking.
    let handles: Vec<_> = items
        .into_iter()
        .map(|(id, head)| tokio::spawn(async move { fetch_entry(&id, head, dict).await }))
        .collect();
    let mut out = Vec::new();
    for handle in handles {
        if let Ok(Some(result)) = handle.await {
            out.push(result);
        }
    }
    Ok(out)
}

/// Look up a word in the given dictionary and return its Korean definition +
/// pronunciation urls.
pub async fn lookup(word: &str, dict: Dict) -> anyhow::Result<Option<NaverResult>> {
    let search_url = format!(
        "{}?range=word&query={}",
        dict.search_url(),
        urlencoding::encode(word)
    );
    let search = get_json(&search_url, dict.referer()).await?;

    // Resolve from the first search hit. For Enko, `item_headword` falls back to
    // `handleEntry` (the base word, cheats -> cheat); for Jako it prefers the
    // kanji surface (帰った -> 帰る) over the reading, matching the group path.
    let first = search.pointer("/searchResultMap/searchResultListMap/WORD/items/0");

    let entry_id = first.and_then(|i| i.get("entryId")).and_then(|v| {
        v.as_str()
            .map(String::from)
            .or_else(|| v.as_i64().map(|n| n.to_string()))
    });

    let Some(entry_id) = entry_id else {
        return Ok(None);
    };

    let headword = first
        .and_then(item_headword)
        .unwrap_or_else(|| word.to_string());

    let means_collector = first.and_then(|i| i.get("meansCollector"));

    let entry_url = format!("{}?entryId={entry_id}", dict.entry_url());
    let detail = get_json(&entry_url, dict.referer()).await?;
    let entry = detail.get("entry").unwrap_or(&Value::Null);

    let definition = build_definition(entry, means_collector);
    if definition.is_empty() {
        return Ok(None);
    }

    let (pron_us_url, pron_uk_url) = extract_pron_urls(entry, dict);

    Ok(Some(NaverResult {
        headword,
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

/// Pull the two pronunciation urls into (slot1, slot2), which map to DB media1/media2.
fn extract_pron_urls(entry: &Value, dict: Dict) -> (Option<String>, Option<String>) {
    match dict {
        Dict::Enko => extract_pron_urls_enko(entry),
        Dict::Jako => extract_pron_urls_jako(entry),
    }
}

/// Enko: Naver tags US audio as "A" or "C" (general American) and UK audio as "E".
fn extract_pron_urls_enko(entry: &Value) -> (Option<String>, Option<String>) {
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

/// Jako: a single prons entry carries both recordings. Female -> slot1 (media1),
/// male -> slot2 (media2).
fn extract_pron_urls_jako(entry: &Value) -> (Option<String>, Option<String>) {
    let pron = entry.pointer("/members/0/prons/0");
    let pick = |key: &str| {
        pron.and_then(|p| p.get(key))
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(String::from)
    };
    (pick("female_pron_file"), pick("male_pron_file"))
}

/// Download a pronunciation MP3 by url, using the dictionary's referer.
pub async fn download_pron(url: &str, dict: Dict) -> anyhow::Result<Vec<u8>> {
    let bytes = crate::http::CLIENT
        .get(url)
        .header(reqwest::header::REFERER, dict.referer())
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
    fn item_headword_falls_back_to_handle_entry_for_english() {
        // 영어 항목은 expKanji가 없으므로 handleEntry(정규 표제어)로 폴백한다: cheats -> cheat.
        let item = serde_json::json!({ "handleEntry": "cheat", "entryId": "abc" });
        assert_eq!(item_headword(&item).as_deref(), Some("cheat"));
    }

    #[test]
    fn item_headword_prefers_kanji_over_reading() {
        // 일본어 항목은 읽기(handleEntry)가 아니라 한자 표기(expKanji)를 표제어로 쓴다.
        let item = serde_json::json!({ "handleEntry": "かえる", "expKanji": "帰る·還る" });
        assert_eq!(item_headword(&item).as_deref(), Some("帰る"));
    }

    #[test]
    fn extract_search_items_uses_kanji_surface_for_japanese() {
        // 일한사전은 handleEntry가 읽기(かえる)라 동음이의어 구분이 안 된다.
        // 한자 표기는 expKanji에 있고, 여러 표기는 "·"로 묶여 온다.
        let search = serde_json::json!({
            "searchResultMap": { "searchResultListMap": { "WORD": { "items": [
                { "entryId": "1", "handleEntry": "かえる", "expKanji": "帰る·還る" },
                { "entryId": 2, "handleEntry": "かえる", "expKanji": "変える" }
            ]}}}
        });
        let items = extract_search_items(&search, 5);
        assert_eq!(items.len(), 2);
        // 첫 한자 표기를 클릭/표시·캐시 키로 쓴다(帰る·還る -> 帰る).
        assert_eq!(items[0], ("1".to_string(), "帰る".to_string()));
        // entryId가 숫자로 와도 문자열로 정규화된다.
        assert_eq!(items[1], ("2".to_string(), "変える".to_string()));
    }

    #[test]
    fn extract_search_items_dedups_by_headword() {
        // 첫 한자 표기가 같은 항목은 한 번만 (帰る·還る / 帰る -> 帰る 하나).
        let search = serde_json::json!({
            "searchResultMap": { "searchResultListMap": { "WORD": { "items": [
                { "entryId": "1", "expKanji": "帰る·還る" },
                { "entryId": "2", "expKanji": "帰る" },
                { "entryId": "3", "expKanji": "変える" }
            ]}}}
        });
        let items = extract_search_items(&search, 5);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0], ("1".to_string(), "帰る".to_string()));
        assert_eq!(items[1], ("3".to_string(), "変える".to_string()));
    }

    #[test]
    fn extract_search_items_falls_back_to_reading_without_kanji() {
        // 외래어 등 한자가 없으면 읽기(handleEntry)로 폴백한다.
        let search = serde_json::json!({
            "searchResultMap": { "searchResultListMap": { "WORD": { "items": [
                { "entryId": "1", "handleEntry": "カット", "expKanji": "" }
            ]}}}
        });
        let items = extract_search_items(&search, 5);
        assert_eq!(items[0].1, "カット");
    }

    #[test]
    fn extract_search_items_caps_at_max_and_skips_headless() {
        let search = serde_json::json!({
            "searchResultMap": { "searchResultListMap": { "WORD": { "items": [
                { "entryId": "1", "expKanji": "帰る" },
                { "entryId": "2" }, // 표제어 없음 → 건너뜀
                { "entryId": "3", "expKanji": "返る" },
                { "entryId": "4", "expKanji": "蛙" }
            ]}}}
        });
        let items = extract_search_items(&search, 2);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].1, "帰る");
        assert_eq!(items[1].1, "返る"); // headless 항목은 제외하고 채운다
    }

    #[test]
    fn item_headword_none_when_absent() {
        let item = serde_json::json!({ "entryId": "abc" });
        assert_eq!(item_headword(&item), None);
    }

    #[test]
    fn clean_strips_tags() {
        assert_eq!(clean("<b>hello</b>"), "hello");
        assert_eq!(clean("  spaced  "), "spaced");
        // A bare "<" that is not a tag should survive.
        assert_eq!(clean("a < b"), "a < b");
    }

    #[test]
    fn enko_splits_prons_by_accent_type() {
        let entry = serde_json::json!({
            "members": [{ "prons": [
                { "pron_type": "A", "female_pron_file": "https://dict.example/us.mp3" },
                { "pron_type": "E", "male_pron_file": "https://dict.example/uk.mp3" }
            ]}]
        });
        let (us, uk) = extract_pron_urls(&entry, Dict::Enko);
        assert_eq!(us.as_deref(), Some("https://dict.example/us.mp3"));
        assert_eq!(uk.as_deref(), Some("https://dict.example/uk.mp3"));
    }

    #[test]
    fn jako_uses_female_as_primary_and_male_as_secondary() {
        // 일한사전은 미/영 액센트 구분이 없고 여성/남성 발음만 제공한다.
        // 여성 -> 첫 번째 슬롯(media1), 남성 -> 두 번째 슬롯(media2)으로 매핑한다.
        let entry = serde_json::json!({
            "members": [{ "prons": [{
                "pron_type": "none",
                "pron_symbol": serde_json::Value::Null,
                "female_pron_file": "https://dict.example/f.mp3",
                "male_pron_file": "https://dict.example/m.mp3"
            }]}]
        });
        let (primary, secondary) = extract_pron_urls(&entry, Dict::Jako);
        assert_eq!(primary.as_deref(), Some("https://dict.example/f.mp3"));
        assert_eq!(secondary.as_deref(), Some("https://dict.example/m.mp3"));
    }

    #[test]
    fn jako_appends_reading_for_kanji_headword() {
        // When the headword is kanji, show the reading from `audio_read`: "愛 [あい]".
        let entry = serde_json::json!({
            "audio_read": "あい",
            "members": [{ "show_full_name": "愛" }],
            "means": [{ "origin_mean": "사랑" }]
        });
        let def = build_definition(&entry, None);
        assert!(def.contains("愛 [あい]"), "def was: {def}");
    }

    #[test]
    fn jako_build_definition_extracts_meaning_and_example() {
        let entry = serde_json::json!({
            "primary_mean": "사서|||사전",
            "members": [{ "show_full_name": "じしょ" }],
            "means": [{
                "origin_mean": "사서(辭書); 사전.",
                "examples": [{
                    "origin_example": "辞書を引く",
                    "translations": [{ "origin_translation": "사전을 찾다" }]
                }]
            }]
        });
        let def = build_definition(&entry, None);
        assert!(def.contains("사서, 사전"));
        assert!(def.contains("じしょ"));
        assert!(def.contains("1. 사서(辭書); 사전."));
        assert!(def.contains("辞書を引く"));
    }

    #[test]
    fn build_definition_keeps_example_when_meaning_gloss_is_empty() {
        // "recap"류 표제어: Naver가 뜻 글로스를 origin_mean/show_mean 어디에도
        // 채우지 않고 예문으로만 의미를 전달한다. 뜻이 비었다고 sense를 통째로
        // 버리면 그 안의 예문/번역까지 사라진다 -> 예문은 반드시 살려야 한다.
        let entry = serde_json::json!({
            "members": [{ "show_full_name": "recap" }],
            "means": [{
                "origin_mean": serde_json::Value::Null,
                "show_mean": "",
                "examples": [{
                    "origin_example": "Let me just recap on what we've decided so far.",
                    "translations": [{ "origin_translation": "지금까지 우리가 결정한 내용의 개요를 말씀드리겠습니다." }]
                }]
            }]
        });
        let def = build_definition(&entry, None);
        assert!(def.contains("Let me just recap"), "예문 누락: {def}");
        assert!(def.contains("지금까지 우리가 결정한"), "번역 누락: {def}");
    }

    #[test]
    fn build_definition_falls_back_to_show_mean_for_gloss() {
        // origin_mean이 비면 show_mean을 뜻 라벨로 쓴다.
        let entry = serde_json::json!({
            "means": [{
                "origin_mean": serde_json::Value::Null,
                "show_mean": "요약하다",
                "examples": []
            }]
        });
        let def = build_definition(&entry, None);
        assert!(def.contains("1. 요약하다"), "show_mean 폴백 실패: {def}");
    }

    #[test]
    fn build_definition_includes_multiple_examples_per_meaning() {
        // 한 뜻에 예문이 여러 개면 상한(MAX_EXAMPLES_PER_MEAN)까지 보여준다.
        let entry = serde_json::json!({
            "means": [{
                "origin_mean": "요약하다",
                "examples": [
                    { "origin_example": "first example", "translations": [{ "origin_translation": "첫 번째" }] },
                    { "origin_example": "second example", "translations": [{ "origin_translation": "두 번째" }] }
                ]
            }]
        });
        let def = build_definition(&entry, None);
        assert!(def.contains("first example"), "첫 예문 누락: {def}");
        assert!(def.contains("second example"), "둘째 예문 누락: {def}");
    }

    #[test]
    fn build_definition_uses_means_collector_when_entry_lacks_gloss() {
        // recap류: entry.means에 예문만 있고 뜻(글로스)이 하나도 없다. 이때 search의
        // meansCollector에서 뜻(value)+예문을 가져와 채운다.
        let entry = serde_json::json!({
            "members": [{ "show_full_name": "recap" }],
            "means": [{
                "origin_mean": serde_json::Value::Null,
                "examples": [{ "origin_example": "old example", "translations": [{ "origin_translation": "옛 예문" }] }]
            }]
        });
        let mc = serde_json::json!([{
            "partOfSpeech": "동사",
            "means": [{
                "order": "1",
                "value": "(=<span class=\"related_word\">recapitulate</span>)",
                "exampleOri": "Let me just recap on what we've decided.",
                "exampleTrans": "지금까지 결정한 내용을 요약할게요."
            }]
        }]);
        let def = build_definition(&entry, Some(&mc));
        assert!(
            def.contains("1. (=recapitulate)"),
            "meansCollector 뜻 누락: {def}"
        );
        assert!(
            def.contains("지금까지 결정한 내용을 요약"),
            "meansCollector 번역 누락: {def}"
        );
    }

    #[test]
    fn build_definition_prefers_entry_gloss_over_collector() {
        // entry.means에 뜻이 있으면 meansCollector는 무시하고 entry를 쓴다(회귀 방지).
        let entry = serde_json::json!({
            "means": [{ "origin_mean": "사랑", "examples": [{ "origin_example": "love you" }] }]
        });
        let mc = serde_json::json!([{ "partOfSpeech": "명사", "means": [{ "order": "1", "value": "WRONG_FALLBACK" }] }]);
        let def = build_definition(&entry, Some(&mc));
        assert!(def.contains("1. 사랑"), "entry 뜻 우선 실패: {def}");
        assert!(
            !def.contains("WRONG_FALLBACK"),
            "meansCollector가 잘못 끼어듦: {def}"
        );
    }

    #[test]
    fn build_definition_parses_string_means_collector() {
        // meansCollector가 JSON 문자열로 와도 파싱한다.
        let entry = serde_json::json!({
            "means": [{ "origin_mean": serde_json::Value::Null, "examples": [{}] }]
        });
        let mc = serde_json::Value::String(
            r#"[{"partOfSpeech":"동사","means":[{"order":"1","value":"요약하다"}]}]"#.to_string(),
        );
        let def = build_definition(&entry, Some(&mc));
        assert!(
            def.contains("1. 요약하다"),
            "문자열 meansCollector 파싱 실패: {def}"
        );
    }

    #[test]
    fn build_definition_from_minimal_entry() {
        let entry = serde_json::json!({
            "primary_mean": "현재의|||선물",
            "members": [{ "show_full_name": "pre·sent", "prons": [{ "pron_type": "V", "pron_symbol": "prɪˈzent" }] }],
            "conjs": [{ "tense_type": "11", "conj_content": "presented" }],
            "means": [{ "origin_mean": "현재의", "examples": [{ "origin_example": "at present", "translations": [{ "origin_translation": "현재" }] }] }]
        });
        let def = build_definition(&entry, None);
        assert!(def.contains("현재의, 선물"));
        assert!(def.contains("pre·sent"));
        assert!(def.contains("동[prɪˈzent]"));
        assert!(def.contains("presented"));
        assert!(def.contains("1. 현재의"));
        assert!(def.contains("at present"));
    }
}
