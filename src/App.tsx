import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { lookup, type LookupResult } from "./lib/api";
import { useSuggest } from "./hooks/useSuggest";
import { SuggestList } from "./components/SuggestList";
import { ResultView } from "./components/ResultView";
import "./App.css";

/** Suggestions only make sense while typing a single English word. */
function isEnglishWordFragment(text: string): boolean {
  return /^[a-zA-Z'-]+$/.test(text.trim());
}

function App() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestEnabled = !dismissed && isEnglishWordFragment(query);
  const suggestions = useSuggest(query, suggestEnabled);
  const showSuggest = suggestEnabled && suggestions.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function runLookup(text: string, force = false) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setDismissed(true);
    setLoading(true);
    try {
      setResult(await lookup(trimmed, force));
    } catch {
      setResult({
        kind: "empty",
        text: trimmed,
        definition: "",
        hasPron: false,
        pronUrl: null,
        source: "",
      });
    } finally {
      setLoading(false);
    }
  }

  function pickWord(word: string) {
    setQuery(word);
    setDismissed(true);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (showSuggest && e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
      return;
    }
    if (showSuggest && e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (showSuggest && e.key === "Tab") {
      e.preventDefault();
      pickWord(suggestions[activeIndex >= 0 ? activeIndex : 0]);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      runLookup(showSuggest && activeIndex >= 0 ? suggestions[activeIndex] : query);
      return;
    }
    if (e.key === "Escape") {
      setDismissed(true);
    }
  }

  return (
    <div className="app">
      <div className="app__search">
        <input
          ref={inputRef}
          className="app__input"
          type="text"
          value={query}
          placeholder="단어 또는 문장 입력…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setDismissed(false);
          }}
          onKeyDown={onKeyDown}
        />
        {showSuggest && (
          <SuggestList items={suggestions} activeIndex={activeIndex} onPick={pickWord} />
        )}
      </div>
      <ResultView
        result={result}
        loading={loading}
        onRefresh={() => result && runLookup(result.text, true)}
      />
    </div>
  );
}

export default App;
