import "./FavoritesPanel.css";

interface FavoritesPanelProps {
  items: string[];
  onPick: (term: string) => void;
  onRemove: (term: string) => void;
  onClose: () => void;
}

/** The word book: saved terms, click to look up, ✕ to remove. */
export function FavoritesPanel({ items, onPick, onRemove, onClose }: FavoritesPanelProps) {
  return (
    <div className="fav-overlay" onClick={onClose}>
      <aside className="fav" onClick={(e) => e.stopPropagation()}>
        <header className="fav__head">
          <h2 className="fav__title">단어장</h2>
          <button type="button" className="fav__close" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>
        {items.length === 0 ? (
          <p className="fav__empty">저장된 단어가 없어요. 결과에서 ☆를 눌러 저장해 보세요.</p>
        ) : (
          <ul className="fav__list">
            {items.map((term) => (
              <li key={term} className="fav__item">
                <button type="button" className="fav__term" onClick={() => onPick(term)}>
                  {term}
                </button>
                <button
                  type="button"
                  className="fav__remove"
                  onClick={() => onRemove(term)}
                  aria-label={`${term} 삭제`}
                  title="삭제"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
