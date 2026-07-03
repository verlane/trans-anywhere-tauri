import { useEffect, useState } from "react";
import { addTerm, removeTerm } from "../lib/history";

const KEY = "transanywhere.history";

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

  // Persisting as an effect keeps the setState updaters pure (StrictMode
  // invokes updaters twice in dev, which would double-write storage).
  useEffect(() => {
    persist(items);
  }, [items]);

  function add(term: string) {
    setItems((prev) => addTerm(prev, term));
  }

  function remove(term: string) {
    setItems((prev) => removeTerm(prev, term));
  }

  return { items, add, remove };
}
