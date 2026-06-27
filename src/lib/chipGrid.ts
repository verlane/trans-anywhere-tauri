export interface ChipRect {
  top: number;
  left: number;
}

// Chips on the same wrapped row share a top within a few pixels.
const ROW_TOLERANCE = 4;

/** Group chip indices into visual rows by their top offset, each row sorted left-to-right. */
function groupRows(rects: ChipRect[]): number[][] {
  const order = rects.map((_, i) => i).sort((a, b) => rects[a].top - rects[b].top);
  const rows: number[][] = [];
  let rowTop = Number.NEGATIVE_INFINITY;
  for (const idx of order) {
    if (rects[idx].top - rowTop > ROW_TOLERANCE) {
      rows.push([]);
      rowTop = rects[idx].top;
    }
    rows[rows.length - 1].push(idx);
  }
  for (const row of rows) {
    row.sort((a, b) => rects[a].left - rects[b].left);
  }
  return rows;
}

/**
 * Move the active chip by one visual row in a wrapped layout. Rows are derived
 * from each chip's measured position, not the data, since wrapping depends on
 * layout. Within the target row, the chip nearest the current chip's left edge
 * wins so the highlight stays roughly under the same column.
 */
export function rowMove(rects: ChipRect[], current: number, dir: "up" | "down"): number {
  if (rects.length === 0) {
    return -1;
  }
  if (current < 0 || current >= rects.length) {
    return dir === "down" ? 0 : rects.length - 1;
  }
  const rows = groupRows(rects);
  const curRowIdx = rows.findIndex((row) => row.includes(current));
  const targetRowIdx = dir === "down" ? curRowIdx + 1 : curRowIdx - 1;
  if (targetRowIdx < 0 || targetRowIdx >= rows.length) {
    return current;
  }
  const curLeft = rects[current].left;
  const targetRow = rows[targetRowIdx];
  return targetRow.reduce(
    (best, idx) =>
      Math.abs(rects[idx].left - curLeft) < Math.abs(rects[best].left - curLeft) ? idx : best,
    targetRow[0],
  );
}
