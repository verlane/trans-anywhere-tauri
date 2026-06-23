import { useRef, useState } from "react";
import { lookup } from "../lib/api";
import { summaryLine } from "../lib/preview";

const DEBOUNCE_MS = 250;

export interface WordPreview {
  word: string;
  /** Summary gloss; empty while loading or when not found. */
  text: string;
  loading: boolean;
  /** Hovered span rect, for tooltip placement. */
  anchor: DOMRect;
}

interface UseWordPreview {
  preview: WordPreview | null;
  onEnter: (word: string, anchor: DOMRect) => void;
  onLeave: () => void;
}

/**
 * Hover-to-preview a word's summary gloss. Cache-first (lookup hits the local
 * DB before Naver), memoized in-session, and debounced so only deliberate
 * hovers fetch. Disabled when `enabled` is false.
 */
export function useWordPreview(enabled: boolean): UseWordPreview {
  const [preview, setPreview] = useState<WordPreview | null>(null);
  const cache = useRef<Map<string, string>>(new Map());
  const timer = useRef<number | null>(null);
  const activeWord = useRef<string>("");

  function clearTimer() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function onEnter(word: string, anchor: DOMRect) {
    if (!enabled) {
      return;
    }
    clearTimer();
    activeWord.current = word;
    const key = word.toLowerCase();
    const cached = cache.current.get(key);
    if (cached !== undefined) {
      setPreview({ word, text: cached, loading: false, anchor });
      return;
    }
    timer.current = window.setTimeout(() => {
      setPreview({ word, text: "", loading: true, anchor });
      lookup(word)
        .then((res) => {
          const gloss = res.kind === "word" ? summaryLine(res.definition) : "";
          cache.current.set(key, gloss);
          if (activeWord.current === word) {
            setPreview({ word, text: gloss, loading: false, anchor });
          }
        })
        .catch(() => {
          if (activeWord.current === word) {
            setPreview({ word, text: "", loading: false, anchor });
          }
        });
    }, DEBOUNCE_MS);
  }

  function onLeave() {
    clearTimer();
    activeWord.current = "";
    setPreview(null);
  }

  return { preview, onEnter, onLeave };
}
