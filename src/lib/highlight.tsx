import type { ReactNode } from "react";

/** Matches the "past - pastParticiple - presentParticiple" line in a definition. */
const CONJ = /([a-z']+) - ([a-z']+) - ([a-z']+)/i;

/**
 * Build a lowercase word -> color-class map from the keyword and its conjugation
 * forms, computed once over the whole definition (v1 HighlightTextArray).
 */
export function buildColorMap(text: string, keyword: string): Map<string, string> {
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
  return colors;
}

/** Color the words of a single line using a prebuilt color map. */
export function highlightLine(line: string, colors: Map<string, string>): ReactNode[] {
  if (colors.size === 0) {
    return [line];
  }
  return line.split(/([A-Za-z']+)/).map((part, i) => {
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
