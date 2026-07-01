import { useState } from "react";
import { groupFavorites } from "../lib/groupFavorites";
import type { Lang } from "../lib/lang";
import "./FavoritesPanel.css";

interface FavoritesPanelProps {
  items: string[];
  onPick: (term: string) => void;
  onRemove: (term: string) => void;
  onClose: () => void;
}

type Filter = Lang | "all";

/** Short labels for the language filter chips. */
const CHIP_LABELS: Record<Lang, string> = { en: "EN", ja: "JA", ko: "KO", other: "기타" };

/** The word book: saved terms grouped by language, click to look up, ✕ to remove. */
export function FavoritesPanel({ items, onPick, onRemove, onClose }: FavoritesPanelProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const groups = groupFavorites(items);
  // Fall back to all groups if the active filter no longer has any words
  // (e.g. its last word was just removed).
  const filtered = filter === "all" ? groups : groups.filter((g) => g.lang === filter);
  const shown = filtered.length > 0 ? filtered : groups;
  const showChips = groups.length > 1;

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
          <>
            {showChips && (
              <div className="fav__chips" role="group" aria-label="언어 필터">
                <FilterChip
                  label="전체"
                  count={items.length}
                  active={filter === "all"}
                  onClick={() => setFilter("all")}
                />
                {groups.map((group) => (
                  <FilterChip
                    key={group.lang}
                    label={CHIP_LABELS[group.lang]}
                    count={group.items.length}
                    active={filter === group.lang}
                    onClick={() => setFilter(group.lang)}
                  />
                ))}
              </div>
            )}
            {shown.map((group) => (
              <section key={group.lang} className="fav__section">
                <h3 className="fav__section-head">{group.label}</h3>
                <ul className="fav__list">
                  {group.items.map((term) => (
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
              </section>
            ))}
          </>
        )}
      </aside>
    </div>
  );
}

interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, count, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={active ? "fav__chip fav__chip--active" : "fav__chip"}
      onClick={onClick}
    >
      {label}
      <span className="fav__chip-count">{count}</span>
    </button>
  );
}
