import "./RecentChips.css";

interface RecentChipsProps {
  items: string[];
  onPick: (term: string) => void;
  onRemove: (term: string) => void;
}

/** Recent searches shown as chips on the empty result screen. */
export function RecentChips({ items, onPick, onRemove }: RecentChipsProps) {
  return (
    <div className="recent">
      <span className="recent__label">최근 검색</span>
      <div className="recent__chips">
        {items.map((term) => (
          <span key={term} className="recent__chip">
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
