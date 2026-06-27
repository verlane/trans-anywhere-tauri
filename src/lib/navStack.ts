/** A visited lookup: the search term plus whether it was a single-entry drill-in
 *  (vs. a homophone group). The flag keeps the group and a single row of it as
 *  distinct history entries even though they share the same term. */
export interface NavEntry {
  term: string;
  single: boolean;
}

/** Browser-style back/forward stack: a visit sequence plus a current pointer. */
export interface NavState {
  entries: NavEntry[];
  index: number;
}

export const INITIAL_NAV: NavState = { entries: [], index: -1 };

/** Result of a back/forward move: the new state and the entry to look up. */
interface NavMove {
  state: NavState;
  entry: NavEntry;
}

/**
 * Record a visited term. Pushing after going back truncates the forward
 * history (like a browser); a consecutive duplicate of the current entry (same
 * term *and* mode) is ignored, and the same state object is returned so callers
 * can skip updates.
 */
export function pushNav(state: NavState, term: string, single = false): NavState {
  const trimmed = term.trim();
  if (!trimmed) {
    return state;
  }
  const current = state.entries[state.index];
  if (current && current.term === trimmed && current.single === single) {
    return state;
  }
  const entries = [...state.entries.slice(0, state.index + 1), { term: trimmed, single }];
  return { entries, index: entries.length - 1 };
}

export function canBack(state: NavState): boolean {
  return state.index > 0;
}

export function canForward(state: NavState): boolean {
  return state.index < state.entries.length - 1;
}

export function back(state: NavState): NavMove | null {
  if (!canBack(state)) {
    return null;
  }
  const index = state.index - 1;
  return { state: { ...state, index }, entry: state.entries[index] };
}

export function forward(state: NavState): NavMove | null {
  if (!canForward(state)) {
    return null;
  }
  const index = state.index + 1;
  return { state: { ...state, index }, entry: state.entries[index] };
}
