import type { ReactNode } from "react";

/** Matches the "past - pastParticiple - presentParticiple" line in a definition. */
const CONJ = /([a-z']+) - ([a-z']+) - ([a-z']+)/i;

/**
 * Color the keyword and its conjugation forms wherever they appear in the
 * definition (including example sentences), mirroring v1 HighlightTextArray.
 */
export function highlight(text: string, keyword: string): ReactNode[] {
  const colors = new Map<string, string>();
  const kw = keyword.trim().toLowerCase();
  if (kw) {
    colors.set(kw, "kw");
  }
  const m = text.match(CONJ);
  if (m) {
    colors.set(m[1].toLowerCase(), "past");
    colors.set(m[2].toLowerCase(), "pp");
    colors.set(m[3].toLowerCase(), "ing");
  }
  if (colors.size === 0) {
    return [text];
  }

  return text.split(/([A-Za-z']+)/).map((part, i) => {
    const cls = colors.get(part.toLowerCase());
    return cls ? (
      <span key={i} className={`hl hl--${cls}`}>
        {part}
      </span>
    ) : (
      part
    );
  });
}
