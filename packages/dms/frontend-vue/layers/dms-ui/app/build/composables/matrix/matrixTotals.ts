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
  return columns.filter(
    (column) => kindOf(column) === "number" && !column.excludeFromTotals,
  );
}

/**
 * Row totals, column totals and the grand total. A row total adds the
 * totalled columns; a column total adds every row's cell of a number column
 * (an excluded column still has its own footer); the grand total adds the
 * row totals, so it matches the Total column.
 */
export function computeMatrixTotals(
  rows: MatrixRow[],
  columns: MatrixColumn[],
  valueOf: MatrixCellValueOf,
): MatrixTotalsResult {
  const counted = totalledColumns(columns);
  const numberColumns = columns.filter((column) => kindOf(column) === "number");
  const result: MatrixTotalsResult = { rows: {}, columns: {}, total: 0 };
  for (const column of numberColumns) result.columns[column.id] = 0;
  for (const row of rows) {
    let rowTotal = 0;
    for (const column of numberColumns) {
      const value = numericValue(valueOf(row, column.id));
      result.columns[column.id] = (result.columns[column.id] ?? 0) + value;
      if (counted.includes(column)) rowTotal += value;
    }
    result.rows[row.id] = rowTotal;
    result.total += rowTotal;
  }
  return result;
}

/** Totals that differ from their target. */
export interface MatrixTargetMisses {
  rows: Set<string>;
  columns: Set<string>;
  total: boolean;
  /** Any target missed. */
  isMissed: boolean;
}

// Sums of decimals drift (0.1 + 0.2): a total within this of its target meets it.
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
