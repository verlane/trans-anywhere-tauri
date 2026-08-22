/** A saved word/phrase in the word book, with the short meaning captured at save time. */
export interface FavoriteItem {
  term: string;
  gloss: string;
}

/** Max stored gloss length; the panel truncates further with CSS ellipsis. */
const GLOSS_MAX = 120;

/**
 * First non-empty line of a definition — the primary meaning — capped for storage.
 * Mirrors the backend `gloss_line` in commands.rs.
 */
export function glossLine(definition: string): string {
  const line =
    definition
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  return line.slice(0, GLOSS_MAX);
}

/** Toggle a term in the word book: remove if present (by term), else prepend it. */
export function toggleFavorite(items: FavoriteItem[], term: string, gloss = ""): FavoriteItem[] {
  const trimmed = term.trim();
  if (!trimmed) {
    return items;
  }
  if (items.some((x) => x.term === trimmed)) {
    return items.filter((x) => x.term !== trimmed);
  }
  return [{ term: trimmed, gloss: gloss.slice(0, GLOSS_MAX) }, ...items];
}

/** Whether the (trimmed) term is currently saved. */
export function isFavorite(items: FavoriteItem[], term: string): boolean {
  const trimmed = term.trim();
  return items.some((x) => x.term === trimmed);
}

/**
 * Coerce stored data into FavoriteItem[], migrating the legacy `string[]` format
 * and dropping anything malformed. Used when loading the word book from storage.
 */
export function normalizeFavorites(raw: unknown): FavoriteItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry) => {
    if (typeof entry === "string") {
      return [{ term: entry, gloss: "" }];
    }
    if (entry && typeof entry === "object" && typeof (entry as FavoriteItem).term === "string") {
      const item = entry as FavoriteItem;
      const gloss = typeof item.gloss === "string" ? item.gloss : "";
      return [{ term: item.term, gloss: gloss.slice(0, GLOSS_MAX) }];
    }
    return [];
  });
}
