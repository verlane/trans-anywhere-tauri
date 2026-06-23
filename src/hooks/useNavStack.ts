import { useState } from "react";
import { INITIAL_NAV, pushNav, back, forward, canBack, canForward } from "../lib/navStack";

interface UseNavStack {
  canBack: boolean;
  canForward: boolean;
  push: (term: string) => void;
  /** Move back; returns the term to look up, or null at the boundary. */
  goBack: () => string | null;
  /** Move forward; returns the term to look up, or null at the boundary. */
  goForward: () => string | null;
}

/** Browser-style back/forward navigation over visited search terms. */
export function useNavStack(): UseNavStack {
  const [state, setState] = useState(INITIAL_NAV);

  function push(term: string) {
    setState((prev) => pushNav(prev, term));
  }

  function goBack(): string | null {
    const move = back(state);
    if (!move) {
      return null;
    }
    setState(move.state);
    return move.term;
  }

  function goForward(): string | null {
    const move = forward(state);
    if (!move) {
      return null;
    }
    setState(move.state);
    return move.term;
  }

  return {
    canBack: canBack(state),
    canForward: canForward(state),
    push,
    goBack,
    goForward,
  };
}
