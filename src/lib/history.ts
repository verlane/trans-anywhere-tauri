/** How many recent search terms are kept (and shown as chips). */
export const HISTORY_MAX = 20;

/** Prepend a term, dedup against existing entries, and cap the list. */
export function addTerm(items: string[], term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) {
    return items;
  }
  return [trimmed, ...items.filter((x) => x !== trimmed)].slice(0, HISTORY_MAX);
}

/** Remove a term from the list. */
export function removeTerm(items: string[], term: string): string[] {
  return items.filter((x) => x !== term);
}

/**
 * Coerce stored/imported data into the list's invariants: strings only,
 * trimmed, non-empty, deduped, most-recent first, capped at HISTORY_MAX.
 */
export function normalizeHistory(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const items: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      continue;
    }
    const term = entry.trim();
    if (!term || seen.has(term)) {
      continue;
    }
    seen.add(term);
    items.push(term);
    if (items.length === HISTORY_MAX) {
      break;
    }
  }
  return items;
}
