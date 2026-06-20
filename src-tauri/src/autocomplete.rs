//! Subsequence-matching autocomplete ported from v1 AutoComplete.ahk (`Suggest` / `Score`).
//! The query must match from the first character (anchored), then the remaining
//! characters in order anywhere in the candidate word.

const MAX_SCAN: usize = 100_000;

/// Anchored subsequence test: word[0] must equal query[0], then every query char
/// appears in order. Case-insensitive.
fn subsequence_match(query_lower: &[char], word: &str) -> bool {
    if query_lower.is_empty() {
        return true;
    }
    let w: Vec<char> = word.chars().flat_map(|c| c.to_lowercase()).collect();
    if w.is_empty() || w[0] != query_lower[0] {
        return false;
    }
    let mut qi = 0;
    for &wc in &w {
        if qi < query_lower.len() && wc == query_lower[qi] {
            qi += 1;
        }
    }
    qi == query_lower.len()
}

/// Port of v1 Score(): prefix length dominates, superfluous characters penalize,
/// longer queries get a mild boost.
fn score(query: &str, entry: &str) -> f64 {
    let q: Vec<char> = query.chars().collect();
    let e: Vec<char> = entry.chars().collect();
    let length = q.len();
    let mut s = 100.0_f64;

    // Common prefix length (case-sensitive, matching v1 behavior on already-lowered input).
    let mut pos = 0usize;
    while pos < length && pos < e.len() && q[pos] == e[pos] {
        pos += 1;
    }
    s *= ((pos + 1) as f64).powi(8);

    // Superfluous characters: how much longer the entry is than the query.
    let remaining = e.len().saturating_sub(length) as f64;
    s *= (1.0 + remaining).powf(-1.5);

    s *= (length.max(1) as f64).powf(0.4);
    s
}

/// Return up to `max_results` suggestions for `query`, ranked by score descending.
pub fn suggest(query: &str, words: &[String], max_results: usize) -> Vec<String> {
    let query_lower: Vec<char> = query.chars().flat_map(|c| c.to_lowercase()).collect();
    if query_lower.is_empty() {
        return Vec::new();
    }
    let query_norm: String = query_lower.iter().collect();

    let mut matches: Vec<(f64, &str)> = Vec::new();
    for word in words.iter().take(MAX_SCAN) {
        if subsequence_match(&query_lower, word) {
            let word_lower: String = word.chars().flat_map(|c| c.to_lowercase()).collect();
            matches.push((score(&query_norm, &word_lower), word.as_str()));
        }
    }

    matches.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    matches
        .into_iter()
        .take(max_results)
        .map(|(_, w)| w.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<String> {
        ["present", "pretend", "prevent", "represent", "pelican", "apple"]
            .iter()
            .map(|s| s.to_string())
            .collect()
    }

    #[test]
    fn anchors_on_first_character() {
        let out = suggest("pre", &sample(), 10);
        assert!(out.contains(&"present".to_string()));
        assert!(out.contains(&"prevent".to_string()));
        // "represent" does not start with 'p', so it must be excluded.
        assert!(!out.contains(&"represent".to_string()));
        // "apple" starts with 'a', excluded.
        assert!(!out.contains(&"apple".to_string()));
    }

    #[test]
    fn ranks_exact_prefix_first() {
        let out = suggest("present", &sample(), 10);
        assert_eq!(out.first().map(String::as_str), Some("present"));
    }

    #[test]
    fn empty_query_returns_nothing() {
        assert!(suggest("", &sample(), 10).is_empty());
    }

    #[test]
    fn respects_max_results() {
        let out = suggest("p", &sample(), 2);
        assert_eq!(out.len(), 2);
    }
}
