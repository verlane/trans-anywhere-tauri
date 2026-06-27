import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { lookup, minimizeWindow, type Accent, type LookupResult } from "./lib/api";
import { resolveEscAction } from "./lib/esc";
import { resolveActionKey, type ActionKey } from "./lib/actionKeys";
import { isTranslateAltKey, isNewlineKey } from "./lib/hotkey";
import { playPron, speakTts, setPronVolume } from "./lib/audio";
import { useSuggest } from "./hooks/useSuggest";
import { useSettings } from "./hooks/useSettings";
import { useTheme } from "./hooks/useTheme";
import { useHistory } from "./hooks/useHistory";
import { SuggestList } from "./components/SuggestList";
import { ResultView } from "./components/ResultView";
import { RecentChips } from "./components/RecentChips";
import { FavoritesPanel } from "./components/FavoritesPanel";
import { WordTooltip } from "./components/WordTooltip";
import { useFavorites } from "./hooks/useFavorites";
import { useWordPreview } from "./hooks/useWordPreview";
import { useNavStack } from "./hooks/useNavStack";
import { SettingsPanel } from "./components/SettingsPanel";
import "./App.css";

/** Suggestions only make sense while typing a single English word. */
function isEnglishWordFragment(text: string): boolean {
  return /^[a-zA-Z'-]+$/.test(text.trim());
}

/** Pixels scrolled in the result pane per Alt+J / Alt+K press. */
const RESULT_SCROLL_STEP = 90;

const EMPTY_RESULT = (text: string): LookupResult => ({
  kind: "empty",
  text,
  definition: "",
  source: "",
  lang: "",
  pronMode: "",
});

/** Play a word's pronunciation for the given accent, falling back to TTS. */
function playResultPron(res: LookupResult, accent: Accent): void {
  if (res.kind !== "word") {
    return;
  }
  if (res.pronMode === "tts") {
    speakTts(res.text, res.lang);
    return;
  }
  playPron(res.text, accent);
}

/** True when there's a live text selection, so Ctrl+C should copy that, not the result. */
function hasTextSelection(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.selectionStart !== el.selectionEnd;
  }
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().length > 0;
}

function App() {
  const { settings, update } = useSettings();
  useTheme(settings.theme);
  const history = useHistory();
  const favorites = useFavorites();
  const wordPreview = useWordPreview(settings.hoverPreview);
  const nav = useNavStack();
  const [showFavorites, setShowFavorites] = useState(false);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const runLookupRef = useRef<(text: string, force?: boolean, alt?: boolean) => void>(() => {});
  const runActionRef = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});

  const suggestEnabled = !dismissed && isEnglishWordFragment(query);
  const suggestions = useSuggest(query, suggestEnabled, settings.suggestMinLength);
  const showSuggest = suggestEnabled && suggestions.length > 0;
  const showHistory =
    !dismissed && focused && query.trim() === "" && history.items.length > 0;
  // The currently visible dropdown (autocomplete or history) drives keyboard nav.
  const dropdownItems = showSuggest ? suggestions : showHistory ? history.items : [];

  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setPronVolume(settings.pronVolume);
  }, [settings.pronVolume]);

  useEffect(() => {
    document.documentElement.style.setProperty("--reading-scale", String(settings.textScale / 100));
  }, [settings.textScale]);

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

  // The default accent for the current result's language drives Alt+P and autoplay.
  function defaultAccentFor(res: LookupResult): Accent {
    return res.lang === "ja" ? settings.defaultAccentJa : settings.defaultAccentEn;
  }

  function autoPlay(res: LookupResult) {
    if (res.kind !== "word" || !settings.autoPlay) {
      return;
    }
    playResultPron(res, defaultAccentFor(res));
  }

  function copyResult() {
    if (!result || !result.definition) {
      return;
    }
    navigator.clipboard.writeText(result.definition).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      },
      () => {},
    );
  }

  async function runLookup(text: string, force = false, alt = false, fromNav = false) {
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
        // Back/forward moves replay an existing entry — don't re-push them.
        if (!fromNav) {
          nav.push(trimmed);
        }
      }
    } catch {
      setResult(EMPTY_RESULT(trimmed));
    } finally {
      setLoading(false);
    }
  }
  runLookupRef.current = runLookup;

  function navTo(term: string | null) {
    if (term === null) {
      return;
    }
    wordPreview.onLeave();
    setQuery(term);
    setDismissed(true);
    runLookup(term, false, false, true);
  }
  const navBack = () => navTo(nav.goBack());
  const navForward = () => navTo(nav.goForward());

  function runAction(action: ActionKey) {
    if (action === "open-settings") {
      setShowSettings(true);
      return;
    }
    if (action === "open-favorites") {
      setShowFavorites(true);
      return;
    }
    // The remaining actions operate on the current result.
    if (!result) {
      return;
    }
    switch (action) {
      case "play-primary":
        playResultPron(result, defaultAccentFor(result));
        break;
      case "play-secondary": {
        const other = defaultAccentFor(result) === "us" ? "uk" : "us";
        playResultPron(result, other);
        break;
      }
      case "toggle-favorite":
        if (result.text) {
          favorites.toggle(result.text);
        }
        break;
      case "copy-result":
        copyResult();
        break;
      case "refresh":
        // Mirror the UI: refresh only applies to dictionary entries.
        if (result.source === "naver" || result.source === "cache") {
          runLookupRef.current(result.text, true);
        }
        break;
    }
  }

  // In-app action shortcuts (Alt+P/C/D/R/B/S, Ctrl+C). Global like Esc so they
  // work regardless of focus; disabled while a panel is open so Esc and the
  // panel's own inputs (e.g. the hotkey capture) keep priority.
  runActionRef.current = (e: globalThis.KeyboardEvent) => {
    if (showSettings || showFavorites) {
      return;
    }
    const action = resolveActionKey(e);
    if (!action) {
      return;
    }
    // Ctrl+C only steals copy when nothing is selected; otherwise it's a real copy.
    if (action === "copy-result" && e.ctrlKey && hasTextSelection()) {
      return;
    }
    e.preventDefault();
    runAction(action);
  };

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => runActionRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Esc is handled globally so it works regardless of focus — the input, the
  // result pane, or an open panel. Priority lives in resolveEscAction.
  useEffect(() => {
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.isComposing) {
        return;
      }
      const action = resolveEscAction({
        settingsOpen: showSettings,
        favoritesOpen: showFavorites,
        dropdownOpen: showSuggest || showHistory,
      });
      switch (action) {
        case "close-settings":
          setShowSettings(false);
          break;
        case "close-favorites":
          setShowFavorites(false);
          break;
        case "dismiss-dropdown":
          setDismissed(true);
          break;
        case "minimize":
          minimizeWindow();
          break;
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showSettings, showFavorites, showSuggest, showHistory]);

  useEffect(() => {
    function onMouseUp(e: MouseEvent) {
      // Mouse side buttons: 3 = back, 4 = forward.
      if (e.button === 3) {
        e.preventDefault();
        navBack();
      } else if (e.button === 4) {
        e.preventDefault();
        navForward();
      }
    }
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [navBack, navForward]);

  function pickWord(word: string) {
    setQuery(word);
    setDismissed(true);
    inputRef.current?.focus();
  }

  // Insert a newline at the caret (Shift+Enter), keeping the caret after it.
  function insertNewline(el: HTMLTextAreaElement) {
    const start = el.selectionStart ?? query.length;
    const end = el.selectionEnd ?? query.length;
    setQuery(`${query.slice(0, start)}\n${query.slice(end)}`);
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 1;
    });
  }

  // Handle dropdown navigation (autocomplete or history). Returns true if consumed.
  function handleDropdownNav(e: KeyboardEvent<HTMLTextAreaElement>, items: string[]): boolean {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(items.length - 1, i + 1));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return true;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      pickWord(items[activeIndex >= 0 ? activeIndex : 0]);
      return true;
    }
    return false;
  }

  // Alt+J / Alt+K scroll the result definition pane. Returns true if consumed.
  function handleResultScroll(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!e.altKey) {
      return false;
    }
    if (e.key === "j" || e.key === "J") {
      e.preventDefault();
      resultRef.current?.scrollBy({ top: RESULT_SCROLL_STEP });
      return true;
    }
    if (e.key === "k" || e.key === "K") {
      e.preventDefault();
      resultRef.current?.scrollBy({ top: -RESULT_SCROLL_STEP });
      return true;
    }
    return false;
  }

  // History-specific keys: reopen with ArrowDown (after Esc), delete with Del.
  function handleHistoryKeys(e: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (e.key === "ArrowDown" && dismissed && query.trim() === "" && history.items.length > 0) {
      e.preventDefault();
      setDismissed(false);
      setActiveIndex(0);
      return true;
    }
    if (
      showHistory &&
      e.key === "Delete" &&
      activeIndex >= 0 &&
      activeIndex < dropdownItems.length
    ) {
      e.preventDefault();
      history.remove(dropdownItems[activeIndex]);
      if (activeIndex >= dropdownItems.length - 1) {
        setActiveIndex(activeIndex - 1);
      }
      return true;
    }
    return false;
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (isTranslateAltKey(e)) {
      e.preventDefault();
      runLookup(query, false, true);
      return;
    }
    // Back/forward through visited searches (e.code → layout/IME-independent).
    if (e.altKey && e.code === "KeyH") {
      e.preventDefault();
      navBack();
      return;
    }
    if (e.altKey && e.code === "KeyL") {
      e.preventDefault();
      navForward();
      return;
    }
    if (handleResultScroll(e)) {
      return;
    }
    if (isNewlineKey(e)) {
      e.preventDefault();
      insertNewline(e.currentTarget);
      return;
    }
    if (handleHistoryKeys(e)) {
      return;
    }
    if ((showSuggest || showHistory) && handleDropdownNav(e, dropdownItems)) {
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < dropdownItems.length) {
        const picked = dropdownItems[activeIndex];
        setQuery(picked);
        runLookup(picked);
      } else {
        runLookup(query);
      }
      return;
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
          {query && (
            <button
              type="button"
              className="app__clear"
              onClick={() => {
                setQuery("");
                setDismissed(false);
                inputRef.current?.focus();
              }}
              aria-label="입력 지우기"
              title="지우기"
            >
              ✕
            </button>
          )}
          {showSuggest && (
            <SuggestList items={suggestions} activeIndex={activeIndex} onPick={pickWord} />
          )}
          {showHistory && (
            <SuggestList
              items={history.items}
              activeIndex={activeIndex}
              onPick={(term) => {
                setQuery(term);
                setFocused(false);
                runLookup(term);
              }}
              onDelete={(term) => history.remove(term)}
            />
          )}
        </div>
        <button
          type="button"
          className="app__bookmark"
          onClick={() => setShowFavorites(true)}
          aria-label="단어장 열기"
          title="단어장 (Alt+B)"
        >
          ★
        </button>
        <button
          type="button"
          className="app__gear"
          onClick={() => setShowSettings(true)}
          aria-label="설정 열기"
          title="설정 (Alt+S)"
        >
          ⚙
        </button>
      </div>
      {query.trim() === "" && !loading && history.items.length > 0 ? (
        <RecentChips
          items={history.items}
          onPick={(term) => {
            setQuery(term);
            setDismissed(true);
            runLookup(term);
          }}
          onRemove={history.remove}
        />
      ) : (
        <ResultView
          result={result}
          loading={loading}
          copied={copied}
          onCopy={copyResult}
          defaultAccent={result ? defaultAccentFor(result) : "us"}
          onRefresh={() => result && runLookup(result.text, true)}
          onWordClick={(word) => {
            wordPreview.onLeave();
            setQuery(word);
            setDismissed(true);
            runLookup(word);
          }}
          onWordHover={wordPreview.onEnter}
          onWordLeave={wordPreview.onLeave}
          isFavorite={!!result && favorites.has(result.text)}
          onToggleFavorite={result ? () => favorites.toggle(result.text) : undefined}
          canNavBack={nav.canBack}
          canNavForward={nav.canForward}
          onNavBack={navBack}
          onNavForward={navForward}
          scrollRef={resultRef}
        />
      )}
      {wordPreview.preview && <WordTooltip preview={wordPreview.preview} />}
      {showFavorites && (
        <FavoritesPanel
          items={favorites.items}
          onPick={(term) => {
            setShowFavorites(false);
            setQuery(term);
            setDismissed(true);
            runLookup(term);
          }}
          onRemove={(term) => favorites.toggle(term)}
          onClose={() => setShowFavorites(false)}
        />
      )}
      {showSettings && (
        <SettingsPanel settings={settings} update={update} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default App;
