import type { MatrixAlign, MatrixColumn } from "../../../types/matrix";
import { totalColumnIndex } from "./matrixTotals";
import { kindOf } from "./matrixValues";

/** A data column of the grid, where it sits. */
export interface MatrixColumnSlot {
  type: "column";
  key: string;
  column: MatrixColumn;
  /** From 1, the row header being 1. */
  colIndex: number;
  /** Inline start of a pinned column, in pixels. */
  stickyStart?: number;
}

/** The Total column, where it sits. */
export interface MatrixTotalSlot {
  type: "total";
  key: string;
  colIndex: number;
}

/** A column of the grid, data or Total, in the order drawn. */
export type MatrixGridSlot = MatrixColumnSlot | MatrixTotalSlot;

const TOTAL_SLOT_KEY = "\u0000total";
const FIRST_COLUMN_INDEX = 2;

/**
 * The columns in the order drawn, with the Total column after the last one
 * it adds up and before the ones left out of the totals (annexes stay at
 * the right). Pinned columns stick after the row header, one after another.
 */
export function matrixGridSlots(
  columns: MatrixColumn[],
  widthOf: (column: MatrixColumn) => number,
  rowHeaderWidth: number,
  hasTotalColumn: boolean,
): MatrixGridSlot[] {
  const totalAt = hasTotalColumn ? totalColumnIndex(columns) : -1;
  const slots: MatrixGridSlot[] = [];
  let stickyStart = rowHeaderWidth;
  let isPinnedRun = true;
  columns.forEach((column, index) => {
    if (index === totalAt) slots.push(totalSlot(slots.length));
    isPinnedRun = isPinnedRun && column.pinned === true;
    slots.push({
      type: "column",
      key: column.id,
      column,
      colIndex: slots.length + FIRST_COLUMN_INDEX,
      ...(isPinnedRun && { stickyStart }),
    });
    if (isPinnedRun) stickyStart += widthOf(column);
  });
  if (totalAt >= columns.length) slots.push(totalSlot(slots.length));
  return slots;
}

function totalSlot(position: number): MatrixTotalSlot {
  return {
    type: "total",
    key: TOTAL_SLOT_KEY,
    colIndex: position + FIRST_COLUMN_INDEX,
  };
}

/** How a column's cells, sums and subtotals align: its own, or numbers at the end. */
export function columnAlign(column: MatrixColumn): MatrixAlign {
  return column.align ?? (kindOf(column) === "number" ? "end" : "start");
}
