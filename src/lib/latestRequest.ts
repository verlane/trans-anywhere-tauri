/**
 * Tracks the newest of a series of overlapping async requests so a slow,
 * stale response can be detected and dropped instead of overwriting the
 * result of a newer request (lookup, pronunciation fetch, ...).
 */
export interface LatestRequestGuard {
  /** Start a new request and get its identity. Makes all prior requests stale. */
  begin(): number;
  /** True while `id` is still the newest request (nothing newer began). */
  isCurrent(id: number): boolean;
  /** Make every in-flight request stale without starting a new one. */
  invalidate(): void;
}

export function createLatestRequestGuard(): LatestRequestGuard {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    isCurrent(id: number) {
      return id === current;
    },
    invalidate() {
      current += 1;
    },
  };
}
