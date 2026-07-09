/** Clamp a remembered scroll position to the element's current scrollable range. */
export function clampScrollTop(saved: number, maxScrollTop: number): number {
  if (maxScrollTop <= 0) {
    return 0;
  }
  return Math.min(Math.max(saved, 0), maxScrollTop);
}
