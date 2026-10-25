import type { MatrixColumn } from "../../../types/matrix";

export const MATRIX_MIN_COLUMN_WIDTH = 80;
export const MATRIX_MAX_COLUMN_WIDTH = 640;
export const MATRIX_DEFAULT_COLUMN_WIDTH = 160;
const NUMBER_COLUMN_WIDTH = 104;
const BOOLEAN_COLUMN_WIDTH = 96;

/**
 * The block's columns with the response's: the response wins for an id both
 * declare (its fields over the block's). They come in the response's order,
 * then the block's columns it does not name, in the block's order (the
 * pinned ones are put first where they are drawn).
 */
export function mergeMatrixColumns(
  declared: MatrixColumn[] | undefined,
  answered: MatrixColumn[] | undefined,
): MatrixColumn[] {
  const declaredById = new Map(
    (declared ?? []).map((column) => [column.id, column]),
  );
  const merged = (answered ?? []).map((column) => {
    const fromBlock = declaredById.get(column.id);
    return fromBlock ? { ...fromBlock, ...column } : column;
  });
  const answeredIds = new Set(merged.map((column) => column.id));
  for (const column of declared ?? []) {
    if (!answeredIds.has(column.id)) merged.push(column);
  }
  return merged;
}

/** What a user set on the columns, on this device. */
export interface MatrixColumnPreferences {
  /** Column ids in the order picked; ids not listed follow, as declared. */
  order?: string[];
  /** Shown (`false`) or hidden (`true`) by the user, over `column.hidden`. */
  hidden?: Record<string, boolean>;
  /** Widths dragged to, in pixels. */
  widths?: Record<string, number>;
}

/** The columns in the order the user picked, the ones they never moved after. */
export function orderMatrixColumns(
  columns: MatrixColumn[],
  order: string[] | undefined,
): MatrixColumn[] {
  if (!order?.length) return columns;
  const rank = new Map(order.map((id, index) => [id, index]));
  const unranked = order.length;
  return columns
    .map((column, index) => ({ column, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.column.id) ?? unranked;
      const rightRank = rank.get(right.column.id) ?? unranked;
      return leftRank - rightRank || left.index - right.index;
    })
    .map(({ column }) => column);
}

export function isColumnHidden(
  column: MatrixColumn,
  preferences: MatrixColumnPreferences,
): boolean {
  return preferences.hidden?.[column.id] ?? column.hidden ?? false;
}

/**
 * The columns the grid draws: ordered as the user picked, without the
 * hidden ones, the pinned ones first (they stick after the row header).
 */
export function visibleMatrixColumns(
  columns: MatrixColumn[],
  preferences: MatrixColumnPreferences,
): MatrixColumn[] {
  const shown = orderMatrixColumns(columns, preferences.order).filter(
    (column) => !isColumnHidden(column, preferences),
  );
  return [
    ...shown.filter((column) => column.pinned),
    ...shown.filter((column) => !column.pinned),
  ];
}

export function clampColumnWidth(width: number): number {
  return Math.round(
    Math.min(MATRIX_MAX_COLUMN_WIDTH, Math.max(MATRIX_MIN_COLUMN_WIDTH, width)),
  );
}

const KIND_WIDTHS: Partial<Record<NonNullable<MatrixColumn["kind"]>, number>> =
  {
    number: NUMBER_COLUMN_WIDTH,
    boolean: BOOLEAN_COLUMN_WIDTH,
  };

/**
 * A column's width: dragged to (within the drag's bounds), else declared as
 * it is, else its kind's.
 */
export function matrixColumnWidth(
  column: MatrixColumn,
  preferences: MatrixColumnPreferences,
): number {
  const dragged = preferences.widths?.[column.id];
  if (dragged !== undefined) return clampColumnWidth(dragged);
  return (
    column.width ??
    KIND_WIDTHS[column.kind ?? "text"] ??
    MATRIX_DEFAULT_COLUMN_WIDTH
  );
}

/** The order after moving `columnId` by `step` places among `columns`. */
export function moveColumnOrder(
  columns: MatrixColumn[],
  columnId: string,
  step: number,
): string[] {
  const ids = columns.map((column) => column.id);
  const from = ids.indexOf(columnId);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  ids.splice(from, 1);
  ids.splice(to, 0, columnId);
  return ids;
}

/** The device storage key of a grid's column preferences. */
export function matrixPreferencesKey(
  pageId: string,
  componentId: string,
): string {
  return `dms.matrix.columns:${pageId}:${componentId}`;
}
