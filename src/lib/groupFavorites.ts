import { detectLang, type Lang } from "./lang";

export interface FavoriteGroup {
  lang: Lang;
  label: string;
  items: string[];
}

/** Fixed section order and display labels for the word book. */
const SECTIONS: ReadonlyArray<{ lang: Lang; label: string }> = [
  { lang: "en", label: "English" },
  { lang: "ja", label: "日本語" },
  { lang: "ko", label: "한국어" },
  { lang: "other", label: "기타" },
];

/**
 * Bucket saved words by detected language, preserving each word's original
 * (most-recent-first) order. Empty sections are dropped.
 */
export function groupFavorites(items: string[]): FavoriteGroup[] {
  const buckets = new Map<Lang, string[]>();
  for (const term of items) {
    const lang = detectLang(term);
    const bucket = buckets.get(lang);
    if (bucket) {
      bucket.push(term);
    } else {
      buckets.set(lang, [term]);
    }
  }
  return SECTIONS.flatMap(({ lang, label }) => {
    const groupItems = buckets.get(lang);
    return groupItems ? [{ lang, label, items: groupItems }] : [];
  });
}
