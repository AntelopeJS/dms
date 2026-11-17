import type { MatrixEnterMove } from "../../../types/matrix";

/** A cell of the grid, by its row and column ids. */
export interface MatrixCellAddress {
  rowId: string;
  columnId: string;
}

/** The rows and columns a focus moves through, in the order drawn. */
export interface MatrixFocusOrder {
  rowIds: string[];
  columnIds: string[];
}

/** Rows a PageUp / PageDown moves by. */
const PAGE_STEP = 10;

interface GridPosition {
  row: number;
  column: number;
}

type PositionMove = (
  position: GridPosition,
  focusOrder: MatrixFocusOrder,
  isCtrl: boolean,
) => GridPosition;

const lastRow = (focusOrder: MatrixFocusOrder) => focusOrder.rowIds.length - 1;
const lastColumn = (focusOrder: MatrixFocusOrder) =>
  focusOrder.columnIds.length - 1;

const KEY_MOVES = new Map<string, PositionMove>([
  [
    "ArrowUp",
    ({ row, column }, _focusOrder, isCtrl) => ({
      row: isCtrl ? 0 : row - 1,
      column,
    }),
  ],
  [
    "ArrowDown",
    ({ row, column }, focusOrder, isCtrl) => ({
      row: isCtrl ? lastRow(focusOrder) : row + 1,
      column,
    }),
  ],
  [
    "ArrowLeft",
    ({ row, column }, _focusOrder, isCtrl) => ({
      row,
      column: isCtrl ? 0 : column - 1,
    }),
  ],
  [
    "ArrowRight",
    ({ row, column }, focusOrder, isCtrl) => ({
      row,
      column: isCtrl ? lastColumn(focusOrder) : column + 1,
    }),
  ],
  [
    "Home",
    ({ row }, _focusOrder, isCtrl) => ({ row: isCtrl ? 0 : row, column: 0 }),
  ],
  [
    "End",
    ({ row }, focusOrder, isCtrl) => ({
      row: isCtrl ? lastRow(focusOrder) : row,
      column: lastColumn(focusOrder),
    }),
  ],
  ["PageUp", ({ row, column }) => ({ row: row - PAGE_STEP, column })],
  ["PageDown", ({ row, column }) => ({ row: row + PAGE_STEP, column })],
]);

/** Whether a key moves the focus around the grid. */
export function isMatrixMoveKey(key: string): boolean {
  return KEY_MOVES.has(key);
}

function positionOf(
  focusOrder: MatrixFocusOrder,
  address: MatrixCellAddress,
): GridPosition | null {
  const row = focusOrder.rowIds.indexOf(address.rowId);
  const column = focusOrder.columnIds.indexOf(address.columnId);
  return row < 0 || column < 0 ? null : { row, column };
}

function addressAt(
  focusOrder: MatrixFocusOrder,
  position: GridPosition,
): MatrixCellAddress | null {
  const rowId = focusOrder.rowIds[position.row];
  const columnId = focusOrder.columnIds[position.column];
  return rowId === undefined || columnId === undefined
    ? null
    : { rowId, columnId };
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

/** The first cell of the grid, where a focus without a cell starts. */
export function firstMatrixCell(
  focusOrder: MatrixFocusOrder,
): MatrixCellAddress | null {
  return addressAt(focusOrder, { row: 0, column: 0 });
}

/**
 * Where a key moves the focus: arrows by one cell (Ctrl to the edge), Home
 * and End along the row (Ctrl to the grid's corners), PageUp and PageDown by
 * ten rows. The focus stays inside the grid. `null` for a key that moves
 * nothing.
 */
export function moveMatrixFocus(
  focusOrder: MatrixFocusOrder,
  from: MatrixCellAddress | null,
  key: string,
  isCtrl = false,
): MatrixCellAddress | null {
  const move = KEY_MOVES.get(key);
  if (!move) return null;
  const start = from ? positionOf(focusOrder, from) : null;
  if (!start) return firstMatrixCell(focusOrder);
  const next = move(start, focusOrder, isCtrl);
  return addressAt(focusOrder, {
    row: clamp(next.row, lastRow(focusOrder)),
    column: clamp(next.column, lastColumn(focusOrder)),
  });
}

/** Every cell after (or before, `step` -1) `from`, row by row, without wrapping. */
function cellsFrom(
  focusOrder: MatrixFocusOrder,
  from: GridPosition,
  step: 1 | -1,
  wrap: boolean,
): MatrixCellAddress[] {
  const width = focusOrder.columnIds.length;
  const count = focusOrder.rowIds.length * width;
  const start = from.row * width + from.column;
  const cells: MatrixCellAddress[] = [];
  for (let offset = 1; offset < count; offset++) {
    const raw = start + step * offset;
    if (!wrap && (raw < 0 || raw >= count)) break;
    const index = ((raw % count) + count) % count;
    const address = addressAt(focusOrder, {
      row: Math.floor(index / width),
      column: index % width,
    });
    if (address) cells.push(address);
  }
  return cells;
}

/**
 * The next (or previous) cell `accepts` takes, row by row from `from`:
 * Tab's next editable cell (`wrap` false: none past the last), or N's next
 * empty one (`wrap` true: it goes round). With no `from`, the search starts
 * before the first cell (after the last, going back).
 */
export function findMatrixCell(
  focusOrder: MatrixFocusOrder,
  from: MatrixCellAddress | null,
  step: 1 | -1,
  accepts: (address: MatrixCellAddress) => boolean,
  wrap = false,
): MatrixCellAddress | null {
  if (!focusOrder.rowIds.length || !focusOrder.columnIds.length) return null;
  const start = from ? positionOf(focusOrder, from) : null;
  if (!start) {
    const edge =
      step === 1 ? firstMatrixCell(focusOrder) : lastMatrixCell(focusOrder);
    if (edge && accepts(edge)) return edge;
    if (!edge) return null;
    return findMatrixCell(focusOrder, edge, step, accepts, wrap);
  }
  return cellsFrom(focusOrder, start, step, wrap).find(accepts) ?? null;
}

function lastMatrixCell(
  focusOrder: MatrixFocusOrder,
): MatrixCellAddress | null {
  return addressAt(focusOrder, {
    row: lastRow(focusOrder),
    column: lastColumn(focusOrder),
  });
}

const ENTER_MOVES: Record<MatrixEnterMove, string | null> = {
  down: "ArrowDown",
  right: "ArrowRight",
  stay: null,
};

/** Where Enter moves after saving a cell: down, right or nowhere. */
export function enterMoveTarget(
  focusOrder: MatrixFocusOrder,
  from: MatrixCellAddress,
  enterMove: MatrixEnterMove,
): MatrixCellAddress {
  const key = ENTER_MOVES[enterMove];
  if (!key) return from;
  return moveMatrixFocus(focusOrder, from, key) ?? from;
}

/** A printable character typed without a command modifier: it starts editing. */
export function isTypedCharacter(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1 && event.key !== " ";
}
