import "./WordTooltip.css";
import type { WordPreview } from "../hooks/useWordPreview";

const EDGE_MARGIN = 90;
const GAP = 6;

interface WordTooltipProps {
  preview: WordPreview;
}

/** Floating summary-gloss tooltip anchored under the hovered word. */
export function WordTooltip({ preview }: WordTooltipProps) {
  const { anchor, word, text, loading } = preview;
  const centerX = anchor.left + anchor.width / 2;
  // Keep the (center-anchored) tooltip inside the viewport.
  const clampedX = Math.min(Math.max(centerX, EDGE_MARGIN), window.innerWidth - EDGE_MARGIN);
  const style = { left: `${clampedX}px`, top: `${anchor.bottom + GAP}px` };
  return (
    <div className="word-tip" style={style} role="tooltip">
      <span className="word-tip__word">{word}</span>
      <span className="word-tip__gloss">
        {loading ? "찾는 중…" : text || "뜻을 찾지 못했어요"}
      </span>
    </div>
  );
}
