import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { lookup, type LookupResult } from "./lib/api";
import { playPron } from "./lib/audio";
import { useSuggest } from "./hooks/useSuggest";
import { useSettings } from "./hooks/useSettings";
import { SuggestList } from "./components/SuggestList";
import { ResultView } from "./components/ResultView";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

/** Suggestions only make sense while typing a single English word. */
function isEnglishWordFragment(text: string): boolean {
  return /^[a-zA-Z'-]+$/.test(text.trim());
}

const EMPTY_RESULT = (text: string): LookupResult => ({
  kind: "empty",
  text,
  definition: "",
  source: "",
});

function App() {
  const { settings, update } = useSettings();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runLookupRef = useRef<(text: string, force?: boolean) => void>(() => {});

  const suggestEnabled = !dismissed && isEnglishWordFragment(query);
  const suggestions = useSuggest(query, suggestEnabled, settings.suggestMinLength);
  const showSuggest = suggestEnabled && suggestions.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Global shortcut events from the backend.
  useEffect(() => {
    // Short press: focus and select the input so it can be overtyped.
    const showP = listen("show-window", () => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
    // Long press: the backend copied the foreground selection — search it.
    const searchP = listen<string>("show-window-search", (e) => {
      const text = (e.payload || "").trim();
      inputRef.current?.focus();
      if (text) {
        setQuery(text);
        runLookupRef.current(text);
      }
    });
    return () => {
      showP.then((off) => off());
      searchP.then((off) => off());
    };
  }, []);

  function autoPlay(res: LookupResult) {
    if (res.kind !== "word" || !settings.autoPlay) {
      return;
    }
    playPron(res.text, settings.defaultAccent);
  }

  async function runLookup(text: string, force = false) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setDismissed(true);
    setLoading(true);
    try {
      const res = await lookup(trimmed, force);
      setResult(res);
      autoPlay(res);
    } catch {
      setResult(EMPTY_RESULT(trimmed));
    } finally {
      setLoading(false);
    }
  }
  runLookupRef.current = runLookup;

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
      if (showSuggest && activeIndex >= 0) {
        const picked = suggestions[activeIndex];
        setQuery(picked);
        runLookup(picked);
      } else {
        runLookup(query);
      }
      return;
    }
    if (e.key === "Escape") {
      setDismissed(true);
    }
  }

  return (
    <div className="app">
      <div className="app__bar">
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
        <button
          type="button"
          className="app__gear"
          onClick={() => setShowSettings(true)}
          aria-label="설정 열기"
          title="설정"
        >
          ⚙
        </button>
      </div>
      <ResultView
        result={result}
        loading={loading}
        onRefresh={() => result && runLookup(result.text, true)}
      />
      {showSettings && (
        <SettingsPanel settings={settings} update={update} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default App;
