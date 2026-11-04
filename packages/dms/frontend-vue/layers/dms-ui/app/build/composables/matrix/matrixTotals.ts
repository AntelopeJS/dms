import type {
  MatrixColumn,
  MatrixRow,
  MatrixTargets,
} from "../../../types/matrix";
import { kindOf, numericValue } from "./matrixValues";

/** The value a cell shows: its edit's, else the row's. */
export type MatrixCellValueOf = (row: MatrixRow, columnId: string) => unknown;

/** The totals of a grid, from the values on screen (edits included). */
export interface MatrixTotalsResult {
  rows: Record<string, number>;
  columns: Record<string, number>;
  total: number;
}

/** The columns a row total adds up: numbers, minus the excluded ones. */
export function totalledColumns(columns: MatrixColumn[]): MatrixColumn[] {
  return columns.filter(isTotalledColumn);
}

/**
 * Row totals, column totals and the grand total, over the totalled columns
 * only: a column left out of the totals (an annex, a price, a rate) is part
 * of no total, not even its own footer. The grand total adds the row
 * totals, so it matches the Total column.
 */
export function computeMatrixTotals(
  rows: MatrixRow[],
  columns: MatrixColumn[],
  valueOf: MatrixCellValueOf,
): MatrixTotalsResult {
  const counted = totalledColumns(columns);
  const result: MatrixTotalsResult = { rows: {}, columns: {}, total: 0 };
  for (const column of counted) result.columns[column.id] = 0;
  for (const row of rows) {
    let rowTotal = 0;
    for (const column of counted) {
      const value = numericValue(valueOf(row, column.id));
      result.columns[column.id] = (result.columns[column.id] ?? 0) + value;
      rowTotal += value;
    }
    result.rows[row.id] = rowTotal;
    result.total += rowTotal;
  }
  return result;
}

/** Whether a column has a sum in the Total row and the group subtotals. */
export function isTotalledColumn(column: MatrixColumn): boolean {
  return kindOf(column) === "number" && !column.excludeFromTotals;
}

/**
 * Where the Total column is drawn among the columns shown: after the last
 * column it adds up, so the columns left out of the totals (annexes) stay
 * at its right. At the end when no column is added up.
 */
export function totalColumnIndex(columns: MatrixColumn[]): number {
  let last = -1;
  columns.forEach((column, index) => {
    if (isTotalledColumn(column)) last = index;
  });
  return last < 0 ? columns.length : last + 1;
}

/** Totals that differ from their target. */
export interface MatrixTargetMisses {
  rows: Set<string>;
  columns: Set<string>;
  total: boolean;
  /** Any target missed. */
  isMissed: boolean;
}

const TARGET_EPSILON = 1e-9;

const differs = (actual: number | undefined, expected: number): boolean =>
  Math.abs((actual ?? 0) - expected) > TARGET_EPSILON;

function missedKeys(
  expected: Record<string, number> | undefined,
  actual: Record<string, number>,
): Set<string> {
  return new Set(
    Object.entries(expected ?? {})
      .filter(([id, target]) => differs(actual[id], target))
      .map(([id]) => id),
  );
}

export function matrixTargetMisses(
  targets: MatrixTargets | undefined,
  totals: MatrixTotalsResult,
): MatrixTargetMisses {
  const rows = missedKeys(targets?.rows, totals.rows);
  const columns = missedKeys(targets?.columns, totals.columns);
  const total =
    targets?.total !== undefined && differs(totals.total, targets.total);
  return {
    rows,
    columns,
    total,
    isMissed: total || rows.size > 0 || columns.size > 0,
  };
}

/** The block's targets with the route's: the route's win, key by key. */
export function mergeMatrixTargets(
  declared: MatrixTargets | undefined,
  answered: MatrixTargets | undefined,
): MatrixTargets | undefined {
  if (!declared) return answered;
  if (!answered) return declared;
  return {
    ...declared,
    ...answered,
    rows: { ...declared.rows, ...answered.rows },
    columns: { ...declared.columns, ...answered.columns },
  };
}
