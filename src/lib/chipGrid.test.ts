import { describe, it, expect } from "vitest";
import { rowMove, type ChipRect } from "./chipGrid";

// Two rows: indices 0,1,2 on top (y=0), 3,4 below (y=30).
const GRID: ChipRect[] = [
  { top: 0, left: 0 },
  { top: 0, left: 40 },
  { top: 0, left: 90 },
  { top: 30, left: 0 },
  { top: 30, left: 50 },
];

describe("rowMove", () => {
  it("jumps down to the nearest-left chip in the next row", () => {
    // From idx1 (left 40), row below has lefts 0 and 50 -> 50 (idx4) is closer.
    expect(rowMove(GRID, 1, "down")).toBe(4);
  });

  it("jumps up to the nearest-left chip in the previous row", () => {
    // From idx4 (left 50), top row lefts 0,40,90 -> 40 (idx1) is closest.
    expect(rowMove(GRID, 4, "up")).toBe(1);
  });

  it("stays put when already on the first row going up", () => {
    expect(rowMove(GRID, 0, "up")).toBe(0);
  });

  it("stays put when already on the last row going down", () => {
    expect(rowMove(GRID, 4, "down")).toBe(4);
  });

  it("enters the first chip from an empty selection going down", () => {
    expect(rowMove(GRID, -1, "down")).toBe(0);
  });

  it("returns -1 when there are no chips", () => {
    expect(rowMove([], 0, "down")).toBe(-1);
  });
});
