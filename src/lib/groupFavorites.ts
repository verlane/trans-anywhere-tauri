import { detectLang, type Lang } from "./lang";
import type { FavoriteItem } from "./favorites";

export interface FavoriteGroup {
  lang: Lang;
  label: string;
  items: FavoriteItem[];
}

/** Fixed section order and display labels for the word book. */
const SECTIONS: ReadonlyArray<{ lang: Lang; label: string }> = [
  { lang: "en", label: "English" },
  { lang: "ja", label: "日本語" },
  { lang: "ko", label: "한국어" },
  { lang: "other", label: "기타" },
];

/**
 * Bucket saved words by their detected language, preserving each word's original
 * (most-recent-first) order. Empty sections are dropped.
 */
export function groupFavorites(items: FavoriteItem[]): FavoriteGroup[] {
  const buckets = new Map<Lang, FavoriteItem[]>();
  for (const item of items) {
    const lang = detectLang(item.term);
    const bucket = buckets.get(lang);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(lang, [item]);
    }
  }
  return SECTIONS.flatMap(({ lang, label }) => {
    const groupItems = buckets.get(lang);
    return groupItems ? [{ lang, label, items: groupItems }] : [];
  });
}
