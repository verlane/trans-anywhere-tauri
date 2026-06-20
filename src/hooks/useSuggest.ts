import { useEffect, useState } from "react";
import { suggest } from "../lib/api";

const DEBOUNCE_MS = 130;

/** Returns debounced autocomplete suggestions for an in-progress English word. */
export function useSuggest(query: string, enabled: boolean, minLength: number): string[] {
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || query.trim().length < minLength) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const words = await suggest(query.trim());
        if (!cancelled) {
          setResults(words);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, enabled, minLength]);

  return results;
}
