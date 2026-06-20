import type { ReactNode } from "react";
import type { LookupResult, LookupSource } from "../lib/api";
import { playPron } from "../lib/audio";
import { buildColorMap, highlightLine } from "../lib/highlight";
import "./ResultView.css";

const SOURCE_LABEL: Record<LookupSource, string> = {
  cache: "사전 DB",
  naver: "네이버 사전",
  google: "구글 번역",
  "": "",
};

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
  // US/UK pronunciation and refresh only apply to English dictionary entries.
  const isDictEntry = result.source === "naver" || result.source === "cache";

  return (
    <article className="result">
      <header className="result__head">
        {/* Sentences already show the source text in the input; don't repeat it. */}
        {!isSentence && <h1 className="result__title">{result.text}</h1>}
        <div className="result__meta">
          <div className="result__actions">
            {isDictEntry && (
              <button
                type="button"
                className="result__pron"
                onClick={() => playPron(result.text, "us")}
                aria-label="미국식 발음 듣기"
                title="미국식 발음"
              >
                🇺🇸 발음
              </button>
            )}
            {isDictEntry && (
              <button
                type="button"
                className="result__pron"
                onClick={() => playPron(result.text, "uk")}
                aria-label="영국식 발음 듣기"
                title="영국식 발음"
              >
                🇬🇧 발음
              </button>
            )}
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
