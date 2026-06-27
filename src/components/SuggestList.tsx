import { useEffect, useRef } from "react";
import "./SuggestList.css";

interface SuggestListProps {
  items: string[];
  activeIndex: number;
  onPick: (word: string) => void;
}

/** Floating autocomplete list. Numbered 1-9, 0 like the v1 app for quick selection. */
export function SuggestList({ items, activeIndex, onPick }: SuggestListProps) {
  const activeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="suggest" role="listbox">
      {items.map((word, i) => (
        <li
          key={word}
          ref={i === activeIndex ? activeRef : undefined}
          role="option"
          aria-selected={i === activeIndex}
          className={i === activeIndex ? "suggest__item suggest__item--active" : "suggest__item"}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(word);
          }}
        >
          <span className="suggest__index">{i < 9 ? i + 1 : i === 9 ? 0 : ""}</span>
          <span className="suggest__word">{word}</span>
        </li>
      ))}
    </ul>
  );
}
