import { useEffect, useRef, type RefObject } from "react";
import "./RecentChips.css";

interface RecentChipsProps {
  items: string[];
  /** Keyboard-highlighted chip index, or -1 when none is active. */
  activeIndex: number;
  /** Chips container, read by the parent to measure rows for up/down nav. */
  listRef?: RefObject<HTMLDivElement | null>;
  onPick: (term: string) => void;
  onRemove: (term: string) => void;
}

/** Recent searches shown as chips on the empty result screen. */
export function RecentChips({ items, activeIndex, listRef, onPick, onRemove }: RecentChipsProps) {
  const activeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="recent">
      <span className="recent__label">최근 검색</span>
      <div className="recent__chips" ref={listRef}>
        {items.map((term, i) => (
          <span
            key={term}
            ref={i === activeIndex ? activeRef : undefined}
            className={i === activeIndex ? "recent__chip recent__chip--active" : "recent__chip"}
            aria-selected={i === activeIndex}
          >
            <button type="button" className="recent__chip-text" onClick={() => onPick(term)}>
              {term}
            </button>
            <button
              type="button"
              className="recent__chip-x"
              onClick={() => onRemove(term)}
              aria-label={`${term} 삭제`}
              title="삭제"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
