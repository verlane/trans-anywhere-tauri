/** Browser-style back/forward stack: a visit sequence plus a current pointer. */
export interface NavState {
  entries: string[];
  index: number;
}

export const INITIAL_NAV: NavState = { entries: [], index: -1 };

/** Result of a back/forward move: the new state and the term to look up. */
interface NavMove {
  state: NavState;
  term: string;
}

/**
 * Record a visited term. Pushing after going back truncates the forward
 * history (like a browser); a consecutive duplicate of the current entry is
 * ignored, and the same state object is returned so callers can skip updates.
 */
export function pushNav(state: NavState, term: string): NavState {
  const trimmed = term.trim();
  if (!trimmed || state.entries[state.index] === trimmed) {
    return state;
  }
  const entries = [...state.entries.slice(0, state.index + 1), trimmed];
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
  return { state: { ...state, index }, term: state.entries[index] };
}

export function forward(state: NavState): NavMove | null {
  if (!canForward(state)) {
    return null;
  }
  const index = state.index + 1;
  return { state: { ...state, index }, term: state.entries[index] };
}
