import { useState } from "react";

const KEY = "transanywhere.history";
const MAX = 10;

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

interface UseHistory {
  items: string[];
  add: (term: string) => void;
  remove: (term: string) => void;
}

/** Recent search terms, most-recent first, persisted in localStorage. */
export function useHistory(): UseHistory {
  const [items, setItems] = useState<string[]>(load);

  function add(term: string) {
    const trimmed = term.trim();
    if (!trimmed) {
      return;
    }
    setItems((prev) => {
      const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, MAX);
      persist(next);
      return next;
    });
  }

  function remove(term: string) {
    setItems((prev) => {
      const next = prev.filter((x) => x !== term);
      persist(next);
      return next;
    });
  }

  return { items, add, remove };
}
