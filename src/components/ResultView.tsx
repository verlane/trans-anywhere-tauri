import type { LookupResult, LookupSource } from "../lib/api";
import { playPron } from "../lib/audio";
import { highlight } from "../lib/highlight";
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

  return (
    <article className="result">
      <header className="result__head">
        <h1 className={isSentence ? "result__title result__title--sentence" : "result__title"}>
          {result.text}
        </h1>
        <div className="result__meta">
          <div className="result__actions">
            {!isSentence && (
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
            {!isSentence && (
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
            {!isSentence && (
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
      <p className="result__body">
        {isSentence
          ? result.definition
          : highlight(formatDefinition(result.definition), result.text)}
      </p>
    </article>
  );
}
