import { useState } from "react";
import { toggleFavorite, isFavorite } from "../lib/favorites";

const KEY = "transanywhere.favorites";

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function persist(items: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
}

interface UseFavorites {
  items: string[];
  toggle: (term: string) => void;
  has: (term: string) => boolean;
}

/** Saved words/phrases (the word book), persisted in localStorage. */
export function useFavorites(): UseFavorites {
  const [items, setItems] = useState<string[]>(load);

  function toggle(term: string) {
    setItems((prev) => {
      const next = toggleFavorite(prev, term);
      persist(next);
      return next;
    });
  }

  function has(term: string): boolean {
    return isFavorite(items, term);
  }

  return { items, toggle, has };
}
