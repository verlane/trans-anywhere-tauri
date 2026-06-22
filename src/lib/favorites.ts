/** Toggle a term in the favorites list: remove if present, else prepend (most-recent first). */
export function toggleFavorite(items: string[], term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) {
    return items;
  }
  if (items.includes(trimmed)) {
    return items.filter((x) => x !== trimmed);
  }
  return [trimmed, ...items];
}

/** Whether the (trimmed) term is currently saved. */
export function isFavorite(items: string[], term: string): boolean {
  return items.includes(term.trim());
}
