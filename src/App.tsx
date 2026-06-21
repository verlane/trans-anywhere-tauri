import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { lookup, type LookupResult } from "./lib/api";
import { matchHotkey } from "./lib/hotkey";
import { playPron, speakTts } from "./lib/audio";
import { useSuggest } from "./hooks/useSuggest";
import { useSettings } from "./hooks/useSettings";
import { useHistory } from "./hooks/useHistory";
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
  lang: "",
  pronMode: "",
});

function App() {
  const { settings, update } = useSettings();
  const history = useHistory();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const runLookupRef = useRef<(text: string, force?: boolean, alt?: boolean) => void>(() => {});

  const suggestEnabled = !dismissed && isEnglishWordFragment(query);
  const suggestions = useSuggest(query, suggestEnabled, settings.suggestMinLength);
  const showSuggest = suggestEnabled && suggestions.length > 0;
  const showHistory = focused && query.trim() === "" && history.items.length > 0;

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-grow the textarea to fit its content, capped at half the window height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    const max = window.innerHeight * 0.5;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    // Only show a scrollbar once the content exceeds the cap.
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [query]);

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
    if (res.pronMode === "tts") {
      speakTts(res.text, res.lang);
      return;
    }
    const accent = res.lang === "ja" ? settings.defaultAccentJa : settings.defaultAccentEn;
    playPron(res.text, accent);
  }

  async function runLookup(text: string, force = false, alt = false) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }
    setDismissed(true);
    setLoading(true);
    try {
      const res = await lookup(trimmed, force, alt);
      setResult(res);
      autoPlay(res);
      if (res.kind !== "empty") {
        history.add(trimmed);
      }
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

  // Insert a newline at the caret (Ctrl+Enter), keeping the caret after it.
  function insertNewline(el: HTMLTextAreaElement) {
    const start = el.selectionStart ?? query.length;
    const end = el.selectionEnd ?? query.length;
    setQuery(`${query.slice(0, start)}\n${query.slice(end)}`);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 1;
    });
  }

  // Handle suggestion-list navigation. Returns true if the key was consumed.
  function handleSuggestNav(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return true;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      pickWord(suggestions[activeIndex >= 0 ? activeIndex : 0]);
      return true;
    }
    return false;
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Toggle-translate shortcut: translate into the secondary target language.
    if (matchHotkey(e, settings.toggleHotkey)) {
      e.preventDefault();
      runLookup(query, false, true);
      return;
    }
    // Ctrl+Enter inserts a newline (Enter alone runs the search).
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      insertNewline(e.currentTarget);
      return;
    }
    if (showSuggest && handleSuggestNav(e)) {
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
          <textarea
            ref={inputRef}
            className="app__input"
            value={query}
            placeholder="단어 또는 문장 입력"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            rows={1}
            onChange={(e) => {
              setQuery(e.target.value);
              setDismissed(false);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
          />
          {showSuggest && (
            <SuggestList items={suggestions} activeIndex={activeIndex} onPick={pickWord} />
          )}
          {showHistory && (
            <SuggestList
              items={history.items}
              activeIndex={-1}
              onPick={(term) => {
                setQuery(term);
                setFocused(false);
                runLookup(term);
              }}
            />
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
