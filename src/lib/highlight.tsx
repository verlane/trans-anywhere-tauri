import type { MouseEvent, ReactNode } from "react";

/** A run of a definition line: a clickable English word, or an untouched gap. */
export interface WordToken {
  text: string;
  isWord: boolean;
}

/**
 * One clickable English word: ASCII letters with inner apostrophes/hyphens,
 * not adjacent to a non-ASCII letter — so IPA runs like "ˈɪndɪ" aren't split
 * into bogus "nd" words.
 */
const WORD_RE = /(?<![^\x00-\x7F])[A-Za-z]+(?:['-][A-Za-z]+)*(?![^\x00-\x7F])/g;

/**
 * Split a line into clickable English-word tokens and the gaps between them.
 * Korean, punctuation, digits, and IPA (non-ASCII) stay as non-word gaps so
 * only real English words become look-up-on-click targets.
 */
export function splitWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (m.index > last) {
      tokens.push({ text: text.slice(last, m.index), isWord: false });
    }
    tokens.push({ text: m[0], isWord: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    tokens.push({ text: text.slice(last), isWord: false });
  }
  return tokens;
}

/** Matches the "past - pastParticiple - presentParticiple" line in a definition. */
const CONJ = /([a-z']+) - ([a-z']+) - ([a-z']+)/i;

/**
 * Kanji-with-furigana left in the text by clean() (the ruby `<rb>`/`<rt>` is
 * flattened to "漢字(かな)"). Only kana inside the parens count — a Han-in-parens
 * gloss like 사서(辭書) is left as plain text.
 */
const RUBY = /(\p{Script=Han}+)\(((?:\p{Script=Hiragana}|\p{Script=Katakana}|ー)+)\)/gu;

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

/** Whether a line contains kanji-with-furigana that renderLine turns into ruby. */
export function hasRuby(line: string): boolean {
  RUBY.lastIndex = 0;
  return RUBY.test(line);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNonAscii(s: string): boolean {
  return [...s].some((c) => c.charCodeAt(0) > 127);
}

/**
 * Body for an inflected English keyword: also match the plural / 3rd-person
 * forms (-s / -es / -ies). -ed / -ing are deliberately left out — those are the
 * conjugation forms, colored separately by buildColorMap.
 */
function inflectedBody(kw: string): string {
  // consonant + y -> -ies (carry -> carries); keep the bare form too.
  if (/[^aeiou]y$/i.test(kw)) {
    return `(?:${escapeRegExp(kw)}|${escapeRegExp(kw.slice(0, -1))}ies)`;
  }
  return `${escapeRegExp(kw)}(?:es|s)?`;
}

/**
 * Regex for one keyword. English matches on word boundaries; others as
 * substrings. When `inflect` is set, English keywords also match their plural /
 * 3rd-person forms (the conjugation forms keep their own color).
 */
export function keywordRegex(kw: string, inflect: boolean): RegExp {
  if (hasNonAscii(kw)) {
    return new RegExp(escapeRegExp(kw), "g");
  }
  const body = inflect ? inflectedBody(kw) : escapeRegExp(kw);
  return new RegExp(`(?<![A-Za-z'])${body}(?![A-Za-z'])`, "gi");
}

interface Span {
  start: number;
  end: number;
  cls: string;
}

/** Keyword/conjugation spans over a line, sorted and de-overlapped. */
function computeSpans(text: string, colors: Map<string, string>): Span[] {
  const spans: Span[] = [];
  for (const [kw, cls] of colors) {
    const re = keywordRegex(kw, cls === "kw");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      spans.push({ start: m.index, end: m.index + m[0].length, cls });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Span[] = [];
  let pos = 0;
  for (const span of spans) {
    if (span.start < pos) {
      continue;
    }
    out.push(span);
    pos = span.end;
  }
  return out;
}

/** Callback fired when a clickable English word in a definition is clicked. */
export type WordClick = (word: string) => void;

/** Click/hover handlers attached to clickable English words in a definition. */
export interface WordHandlers {
  onClick?: WordClick;
  onHover?: (word: string, anchor: DOMRect) => void;
  onLeave?: () => void;
}

/** DOM event props for a clickable word span (look-up on click, preview on hover). */
function wordProps(word: string, handlers: WordHandlers) {
  return {
    onClick: handlers.onClick ? () => handlers.onClick?.(word) : undefined,
    onMouseEnter: handlers.onHover
      ? (e: MouseEvent<HTMLSpanElement>) => handlers.onHover?.(word, e.currentTarget.getBoundingClientRect())
      : undefined,
    onMouseLeave: handlers.onLeave,
  };
}

/** Render plain text, wrapping English words as click/hover spans. */
function renderText(text: string, handlers: WordHandlers | undefined, nextKey: () => number): ReactNode[] {
  if (!handlers) {
    return [text];
  }
  return splitWords(text).map((tok) =>
    tok.isWord ? (
      <span key={nextKey()} className="word" {...wordProps(tok.text, handlers)}>
        {tok.text}
      </span>
    ) : (
      tok.text
    ),
  );
}

/** Color one text segment (at absolute `base`) using the precomputed spans. */
function colorSegment(
  text: string,
  base: number,
  spans: Span[],
  nextKey: () => number,
  handlers?: WordHandlers,
): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = 0;
  for (const span of spans) {
    const start = Math.max(0, span.start - base);
    const end = Math.min(text.length, span.end - base);
    if (end <= 0 || start >= text.length || start >= end) {
      continue;
    }
    if (start > pos) {
      out.push(...renderText(text.slice(pos, start), handlers, nextKey));
    }
    const word = text.slice(start, end);
    out.push(
      <span
        key={nextKey()}
        className={handlers ? `hl hl--${span.cls} word` : `hl hl--${span.cls}`}
        {...(handlers ? wordProps(word, handlers) : {})}
      >
        {word}
      </span>,
    );
    pos = end;
  }
  if (pos < text.length) {
    out.push(...renderText(text.slice(pos), handlers, nextKey));
  }
  return out;
}

/**
 * Render one definition line: turn "漢字(かな)" into real ruby (furigana above),
 * and color keyword/conjugation matches — computed over the furigana-stripped
 * text so highlights aren't broken up by the readings.
 */
export function renderLine(
  line: string,
  colors: Map<string, string>,
  handlers?: WordHandlers,
): ReactNode[] {
  const segments: Array<{ text: string; ruby?: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  RUBY.lastIndex = 0;
  while ((m = RUBY.exec(line)) !== null) {
    if (m.index > last) {
      segments.push({ text: line.slice(last, m.index) });
    }
    segments.push({ text: m[1], ruby: m[2] });
    last = m.index + m[0].length;
  }
  if (last < line.length) {
    segments.push({ text: line.slice(last) });
  }

  const plain = segments.map((s) => s.text).join("");
  const spans = colors.size > 0 ? computeSpans(plain, colors) : [];

  const nodes: ReactNode[] = [];
  let key = 0;
  const nextKey = () => key++;
  let offset = 0;
  for (const seg of segments) {
    const colored = colorSegment(seg.text, offset, spans, nextKey, handlers);
    if (seg.ruby) {
      nodes.push(
        <ruby key={nextKey()}>
          {colored}
          <rt>{seg.ruby}</rt>
        </ruby>,
      );
    } else {
      for (const node of colored) {
        nodes.push(node);
      }
    }
    offset += seg.text.length;
  }
  return nodes;
}
