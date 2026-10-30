import type { MatrixEnterMove } from "../../../types/matrix";

/** A cell of the grid, by its row and column ids. */
export interface MatrixCellAddress {
  rowId: string;
  columnId: string;
}

/** The rows and columns a focus moves through, in the order drawn. */
export interface MatrixGridShape {
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
  shape: MatrixGridShape,
  isCtrl: boolean,
) => GridPosition;

const lastRow = (shape: MatrixGridShape) => shape.rowIds.length - 1;
const lastColumn = (shape: MatrixGridShape) => shape.columnIds.length - 1;

const KEY_MOVES: Record<string, PositionMove> = {
  ArrowUp: ({ row, column }, _shape, isCtrl) => ({
    row: isCtrl ? 0 : row - 1,
    column,
  }),
  ArrowDown: ({ row, column }, shape, isCtrl) => ({
    row: isCtrl ? lastRow(shape) : row + 1,
    column,
  }),
  ArrowLeft: ({ row, column }, _shape, isCtrl) => ({
    row,
    column: isCtrl ? 0 : column - 1,
  }),
  ArrowRight: ({ row, column }, shape, isCtrl) => ({
    row,
    column: isCtrl ? lastColumn(shape) : column + 1,
  }),
  Home: ({ row }, _shape, isCtrl) => ({ row: isCtrl ? 0 : row, column: 0 }),
  End: ({ row }, shape, isCtrl) => ({
    row: isCtrl ? lastRow(shape) : row,
    column: lastColumn(shape),
  }),
  PageUp: ({ row, column }) => ({ row: row - PAGE_STEP, column }),
  PageDown: ({ row, column }) => ({ row: row + PAGE_STEP, column }),
};

/** Whether a key moves the focus around the grid. */
export function isMatrixMoveKey(key: string): boolean {
  return key in KEY_MOVES;
}

function positionOf(
  shape: MatrixGridShape,
  address: MatrixCellAddress,
): GridPosition | null {
  const row = shape.rowIds.indexOf(address.rowId);
  const column = shape.columnIds.indexOf(address.columnId);
  return row < 0 || column < 0 ? null : { row, column };
}

function addressAt(
  shape: MatrixGridShape,
  position: GridPosition,
): MatrixCellAddress | null {
  const rowId = shape.rowIds[position.row];
  const columnId = shape.columnIds[position.column];
  return rowId === undefined || columnId === undefined
    ? null
    : { rowId, columnId };
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

/** The first cell of the grid, where a focus without a cell starts. */
export function firstMatrixCell(
  shape: MatrixGridShape,
): MatrixCellAddress | null {
  return addressAt(shape, { row: 0, column: 0 });
}

/**
 * Where a key moves the focus: arrows by one cell (Ctrl to the edge), Home
 * and End along the row (Ctrl to the grid's corners), PageUp and PageDown by
 * ten rows. The focus stays inside the grid. `null` for a key that moves
 * nothing.
 */
export function moveMatrixFocus(
  shape: MatrixGridShape,
  from: MatrixCellAddress | null,
  key: string,
  isCtrl = false,
): MatrixCellAddress | null {
  const move = KEY_MOVES[key];
  if (!move) return null;
  const start = from ? positionOf(shape, from) : null;
  if (!start) return firstMatrixCell(shape);
  const next = move(start, shape, isCtrl);
  return addressAt(shape, {
    row: clamp(next.row, lastRow(shape)),
    column: clamp(next.column, lastColumn(shape)),
  });
}

/** Every cell after (or before, `step` -1) `from`, row by row, without wrapping. */
function cellsFrom(
  shape: MatrixGridShape,
  from: GridPosition,
  step: 1 | -1,
  wrap: boolean,
): MatrixCellAddress[] {
  const width = shape.columnIds.length;
  const count = shape.rowIds.length * width;
  const start = from.row * width + from.column;
  const cells: MatrixCellAddress[] = [];
  for (let offset = 1; offset < count; offset++) {
    const raw = start + step * offset;
    if (!wrap && (raw < 0 || raw >= count)) break;
    const index = ((raw % count) + count) % count;
    const address = addressAt(shape, {
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
  shape: MatrixGridShape,
  from: MatrixCellAddress | null,
  step: 1 | -1,
  accepts: (address: MatrixCellAddress) => boolean,
  wrap = false,
): MatrixCellAddress | null {
  if (!shape.rowIds.length || !shape.columnIds.length) return null;
  const start = from ? positionOf(shape, from) : null;
  if (!start) {
    const edge = step === 1 ? firstMatrixCell(shape) : lastMatrixCell(shape);
    if (edge && accepts(edge)) return edge;
    if (!edge) return null;
    return findMatrixCell(shape, edge, step, accepts, wrap);
  }
  return cellsFrom(shape, start, step, wrap).find(accepts) ?? null;
}

function lastMatrixCell(shape: MatrixGridShape): MatrixCellAddress | null {
  return addressAt(shape, { row: lastRow(shape), column: lastColumn(shape) });
}

const ENTER_MOVES: Record<MatrixEnterMove, string | null> = {
  down: "ArrowDown",
  right: "ArrowRight",
  stay: null,
};

/** Where Enter moves after saving a cell: down, right or nowhere. */
export function enterMoveTarget(
  shape: MatrixGridShape,
  from: MatrixCellAddress,
  enterMove: MatrixEnterMove,
): MatrixCellAddress {
  const key = ENTER_MOVES[enterMove];
  if (!key) return from;
  return moveMatrixFocus(shape, from, key) ?? from;
}

/** A printable character typed without a command modifier: it starts editing. */
export function isTypedCharacter(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1 && event.key !== " ";
}
