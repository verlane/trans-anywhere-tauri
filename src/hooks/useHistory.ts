import { useState } from "react";

const KEY = "transanywhere.history";
const MAX = 20;

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

interface UseHistory {
  items: string[];
  add: (term: string) => void;
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
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }

  return { items, add };
}
