import { useEffect, useState } from "react";
import {
  toggleFavorite,
  isFavorite,
  normalizeFavorites,
  type FavoriteItem,
} from "../lib/favorites";

const KEY = "transanywhere.favorites";

function load(): FavoriteItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeFavorites(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function persist(items: FavoriteItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

interface UseFavorites {
  items: FavoriteItem[];
  toggle: (term: string, gloss?: string) => void;
  has: (term: string) => boolean;
  /** Swap the whole word book (restoring a backup). */
  replace: (items: FavoriteItem[]) => void;
}

/** Saved words/phrases (the word book), persisted in localStorage. */
export function useFavorites(): UseFavorites {
  const [items, setItems] = useState<FavoriteItem[]>(load);

  // Persisting as an effect keeps the setState updaters pure (StrictMode
  // invokes updaters twice in dev, which would double-write storage).
  useEffect(() => {
    persist(items);
  }, [items]);

  function toggle(term: string, gloss = "") {
    setItems((prev) => toggleFavorite(prev, term, gloss));
  }

  function has(term: string): boolean {
    return isFavorite(items, term);
  }

  function replace(next: FavoriteItem[]) {
    setItems(normalizeFavorites(next));
  }

  return { items, toggle, has, replace };
}
