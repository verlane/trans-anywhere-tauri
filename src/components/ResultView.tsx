import type { ReactNode } from "react";
import type { Accent, LookupResult, LookupSource } from "../lib/api";
import { playPron } from "../lib/audio";
import { buildColorMap, highlightLine } from "../lib/highlight";
import "./ResultView.css";

const SOURCE_LABEL: Record<LookupSource, string> = {
  cache: "사전 DB",
  naver: "네이버 사전",
  google: "구글 번역",
  "": "",
};

interface PronButton {
  accent: Accent;
  label: string;
  title: string;
}

/** Pronunciation buttons: US/UK for English, female/male (media1/media2) for Japanese. */
function pronButtons(isJapanese: boolean): ReadonlyArray<PronButton> {
  if (isJapanese) {
    return [
      { accent: "us", label: "여성", title: "여성 발음 듣기" },
      { accent: "uk", label: "남성", title: "남성 발음 듣기" },
    ];
  }
  return [
    { accent: "us", label: "미국식", title: "미국식 발음 듣기" },
    { accent: "uk", label: "영국식", title: "영국식 발음 듣기" },
  ];
}

/** Put a blank line between the conjugation line and the first numbered sense. */
function formatDefinition(text: string): string {
  return text.replace(/([A-Za-z']+ - [A-Za-z']+ - [A-Za-z']+)\n(\d+\. )/, "$1\n\n$2");
}

/** Matches a numbered sense line like "1. ...". */
const SENSE_LINE = /^\d+\.\s/;

/** Render the definition line by line, emphasizing numbered sense headings. */
function renderDefinition(definition: string, keyword: string): ReactNode {
  const text = formatDefinition(definition);
  const colors = buildColorMap(text, keyword);
  return text.split("\n").map((line, i) => {
    if (line === "") {
      return <div key={i} className="def__gap" />;
    }
    let cls = "def__line";
    if (SENSE_LINE.test(line)) {
      cls += " def__line--sense";
    } else if (/^\s/.test(line) && /[가-힣]/.test(line)) {
      // Indented Korean line = example translation.
      cls += " def__line--trans";
    }
    return (
      <div key={i} className={cls}>
        {highlightLine(line, colors)}
      </div>
    );
  });
}

interface ResultViewProps {
  result: LookupResult | null;
  loading: boolean;
  onRefresh: () => void;
}

export function ResultView({ result, loading, onRefresh }: ResultViewProps) {
  if (loading) {
    return <div className="result result--state">찾는 중…</div>;
  }
  if (!result || result.kind === "empty" || result.definition === "") {
    return (
      <div className="result result--state">
        {result && result.kind === "empty" && result.text
          ? "결과를 찾지 못했어요."
          : "단어나 문장을 입력해 보세요."}
      </div>
    );
  }

  const isSentence = result.kind === "sentence";
  // Pronunciation and refresh only apply to dictionary entries.
  const isDictEntry = result.source === "naver" || result.source === "cache";
  // Japanese has no US/UK accent split — media1/media2 hold female/male instead.
  const prons = pronButtons(result.lang === "ja");

  return (
    <article className="result">
      <header className="result__head">
        {/* Sentences already show the source text in the input; don't repeat it. */}
        {!isSentence && <h1 className="result__title">{result.text}</h1>}
        <div className="result__meta">
          <div className="result__actions">
            {isDictEntry &&
              prons.map((p) => (
                <button
                  key={p.accent}
                  type="button"
                  className="result__pron"
                  onClick={() => playPron(result.text, p.accent)}
                  aria-label={p.title}
                  title={p.title}
                >
                  {p.label}
                </button>
              ))}
            {isDictEntry && (
              <button
                type="button"
                className="result__refresh"
                onClick={onRefresh}
                aria-label="네이버에서 새로고침"
                title="네이버에서 새로고침"
              >
                ↻
              </button>
            )}
          </div>
          {result.source && <span className="result__badge">{SOURCE_LABEL[result.source]}</span>}
        </div>
      </header>
      {isSentence ? (
        <p className="result__body">{result.definition}</p>
      ) : (
        <div className="result__body">{renderDefinition(result.definition, result.text)}</div>
      )}
    </article>
  );
}
