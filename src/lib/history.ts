/** How many recent search terms are kept (and shown as chips). */
export const HISTORY_MAX = 10;

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
