import { useState } from "react";
import { INITIAL_NAV, pushNav, back, forward, canBack, canForward, type NavEntry } from "../lib/navStack";

interface UseNavStack {
  canBack: boolean;
  canForward: boolean;
  push: (term: string, single?: boolean) => void;
  /** Move back; returns the entry to look up, or null at the boundary. */
  goBack: () => NavEntry | null;
  /** Move forward; returns the entry to look up, or null at the boundary. */
  goForward: () => NavEntry | null;
}

/** Browser-style back/forward navigation over visited search terms. */
export function useNavStack(): UseNavStack {
  const [state, setState] = useState(INITIAL_NAV);

  function push(term: string, single = false) {
    setState((prev) => pushNav(prev, term, single));
  }

  function goBack(): NavEntry | null {
    const move = back(state);
    if (!move) {
      return null;
    }
    setState(move.state);
    return move.entry;
  }

  function goForward(): NavEntry | null {
    const move = forward(state);
    if (!move) {
      return null;
    }
    setState(move.state);
    return move.entry;
  }

  return {
    canBack: canBack(state),
    canForward: canForward(state),
    push,
    goBack,
    goForward,
  };
}
