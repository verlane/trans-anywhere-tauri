/**
 * Anchored subsequence match, mirroring the backend autocomplete (`autocomplete.rs`):
 * the first character must match, then the remaining query characters must appear
 * in order anywhere in the word. Case-insensitive; `query` is expected pre-lowered.
 */
function anchoredSubsequence(query: string, word: string): boolean {
  if (query.length === 0) {
    return true;
  }
  const w = word.toLowerCase();
  if (w.length === 0 || w[0] !== query[0]) {
    return false;
  }
  let qi = 1;
  for (let wi = 1; wi < w.length && qi < query.length; wi++) {
    if (w[wi] === query[qi]) {
      qi += 1;
    }
  }
  return qi === query.length;
}

/**
 * Re-orders autocomplete suggestions so previously searched words surface first.
 * Any recent word that matches the current `query` (anchored subsequence, like the
 * backend) is placed at the top in most-recent-first order — even when the backend
 * dropped it from its top-N list, or returned nothing at all. The remaining
 * suggestions keep the backend's score order. Matching is case-insensitive; a word
 * already present in the suggestions keeps its original casing.
 */
export function prioritizeRecent(
  query: string,
  suggestions: string[],
  recent: string[],
): string[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0 || recent.length === 0) {
    return [...suggestions];
  }

  const suggestionByKey = new Map<string, string>();
  for (const word of suggestions) {
    const key = word.toLowerCase();
    if (!suggestionByKey.has(key)) {
      suggestionByKey.set(key, word);
    }
  }

  const promoted: string[] = [];
  const promotedKeys = new Set<string>();
  for (const term of recent) {
    const key = term.toLowerCase();
    if (promotedKeys.has(key) || !anchoredSubsequence(q, term)) {
      continue;
    }
    // Prefer the suggestion's own casing when the word also came from the backend.
    promoted.push(suggestionByKey.get(key) ?? term);
    promotedKeys.add(key);
  }

  const rest = suggestions.filter((word) => !promotedKeys.has(word.toLowerCase()));
  return [...promoted, ...rest];
}
