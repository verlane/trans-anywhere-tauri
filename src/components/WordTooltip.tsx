import "./WordTooltip.css";
import type { WordPreview } from "../hooks/useWordPreview";

const MAX_WIDTH = 240; // keep in sync with .word-tip max-width
const EDGE_MARGIN = 8;
const GAP = 6;
const FLIP_THRESHOLD = 120; // max tooltip height (gloss is line-clamped to 3 lines)

interface WordTooltipProps {
  preview: WordPreview;
}

/** Floating summary-gloss tooltip anchored under (or above) the hovered word. */
export function WordTooltip({ preview }: WordTooltipProps) {
  const { anchor, word, text, loading } = preview;
  const centerX = anchor.left + anchor.width / 2;
  // The tooltip is center-anchored, so keep its center at least half-width +
  // margin from each edge or it clips off-screen.
  const half = MAX_WIDTH / 2 + EDGE_MARGIN;
  const clampedX = Math.min(Math.max(centerX, half), window.innerWidth - half);
  // Flip above the word when there isn't room below.
  const below = anchor.bottom + FLIP_THRESHOLD <= window.innerHeight;
  const top = below ? anchor.bottom + GAP : anchor.top - GAP;
  const transform = below ? "translateX(-50%)" : "translate(-50%, -100%)";
  const style = { left: `${clampedX}px`, top: `${top}px`, transform };
  return (
    <div className="word-tip" style={style} role="tooltip">
      <span className="word-tip__word">{word}</span>
      <span className="word-tip__gloss">
        {loading ? "찾는 중…" : text || "뜻을 찾지 못했어요"}
      </span>
    </div>
  );
}
