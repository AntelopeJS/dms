import { Controller, Get, JSONBody, Post } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  MatrixCellError,
  MatrixCellState,
  MatrixChange,
  MatrixData,
  MatrixRow,
  MatrixSaveRequest,
  MatrixSaveResponse,
} from "@antelopejs/interface-dms/base/matrix";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import {
  cellError,
  type MatrixFillRequest,
  readSaveRequest,
  sameCellValue,
} from "../save";
import {
  CURRENT_STORE,
  findStore,
  isInRange,
  SIZES,
  STOCK,
  type Store,
  type StoreQuantities,
  STORES,
  WAREHOUSE,
} from "../stock/data";
import { allocation, counted, RECEIVED, resetAllocationDemo } from "./data";
import { MATRIX_ALLOCATION_API, PageMatrixAllocation } from "./page";

const MAX_PAIRS = 999;

/** The pairs a fill gives a store in a size; `null` empties the cell. */
type FillRule = (store: Store, size: string) => number | null;

/** The cells of the grid as the browser shows them, by row then column. */
type ShownValues = Record<string, MatrixRow["values"]>;

function storeRowBase(
  store: Store,
): Pick<MatrixRow, "id" | "label" | "description" | "tone"> {
  const isCurrent = store.id === CURRENT_STORE;
  return {
    id: store.id,
    label: store.id,
    description: isCurrent ? `${store.name} · votre magasin` : store.name,
    tone: isCurrent ? "primary" : undefined,
  };
}

function quantityValues(
  store: Store,
  quantities: StoreQuantities,
): Record<string, number | null> {
  return Object.fromEntries(
    SIZES.map((size) => [
      size,
      isInRange(store, size) ? (quantities[store.id]?.[size] ?? null) : null,
    ]),
  );
}

function stockOf(store: Store, size: string): number {
  return STOCK[store.id]?.[size] ?? 0;
}

function allocationCell(store: Store, size: string): MatrixCellState {
  if (!isInRange(store, size)) return { disabled: true };
  return { hint: String(stockOf(store, size)) };
}

function correctionCell(store: Store, size: string): MatrixCellState {
  if (!isInRange(store, size)) return { disabled: true };
  const before = stockOf(store, size);
  const after = counted[store.id]?.[size] ?? 0;
  return after === before ? {} : { previous: before, tone: "warning" };
}

function cellsBy(
  store: Store,
  cellOf: (store: Store, size: string) => MatrixCellState,
): Record<string, MatrixCellState> {
  return Object.fromEntries(SIZES.map((size) => [size, cellOf(store, size)]));
}

function allocationRow(store: Store): MatrixRow {
  return {
    ...storeRowBase(store),
    values: quantityValues(store, allocation),
    cells: cellsBy(store, allocationCell),
  };
}

function correctionRow(store: Store): MatrixRow {
  return {
    ...storeRowBase(store),
    values: quantityValues(store, counted),
    cells: cellsBy(store, correctionCell),
  };
}

/** Why a quantity cannot go in a cell, or `undefined` when it can. */
function quantityProblem(change: MatrixChange): string | undefined {
  const store = findStore(change.rowId);
  if (!store) return "Magasin inconnu.";
  if (!SIZES.includes(change.columnId)) return "Pointure inconnue.";
  if (!isInRange(store, change.columnId)) {
    return `${store.id} n'a pas commandé la pointure ${change.columnId}.`;
  }
  const { value } = change;
  if (value === null) return undefined;
  if (
    !Number.isInteger(value) ||
    Number(value) < 0 ||
    Number(value) > MAX_PAIRS
  ) {
    return `Un nombre entier de paires, de 0 à ${MAX_PAIRS}.`;
  }
  return undefined;
}

function setQuantity(quantities: StoreQuantities, change: MatrixChange): void {
  const row = { ...quantities[change.rowId] };
  if (change.value === null) delete row[change.columnId];
  else row[change.columnId] = Number(change.value);
  quantities[change.rowId] = row;
}

function sizeTotal(quantities: StoreQuantities, size: string): number {
  return STORES.reduce(
    (total, store) => total + (quantities[store.id]?.[size] ?? 0),
    0,
  );
}

/** The changes of a size column whose pairs do not add up to the delivery. */
function unbalancedErrors(
  proposed: StoreQuantities,
  changes: MatrixChange[],
): MatrixCellError[] {
  return changes.flatMap((change) => {
    const size = change.columnId;
    const total = sizeTotal(proposed, size);
    const received = RECEIVED[size] ?? 0;
    if (total === received) return [];
    return [
      cellError(
        change,
        `Pointure ${size} : ${total} paires réparties pour ${received} reçues.`,
      ),
    ];
  });
}

function copyOf(quantities: StoreQuantities): StoreQuantities {
  return Object.fromEntries(
    Object.entries(quantities).map(([store, sizes]) => [store, { ...sizes }]),
  );
}

function shownValues(request: MatrixFillRequest | undefined): ShownValues {
  const rows = Array.isArray(request?.rows)
    ? request.rows
    : STORES.map(allocationRow);
  return Object.fromEntries(rows.map((row) => [row.id, row.values ?? {}]));
}

/** The edits that turn the grid shown into the one a fill computes. */
function fillChanges(
  request: MatrixFillRequest | undefined,
  rule: FillRule,
): MatrixChange[] {
  const shown = shownValues(request);
  return STORES.flatMap((store) =>
    SIZES.filter((size) => isInRange(store, size)).flatMap((size) => {
      const value = rule(store, size);
      const previous = shown[store.id]?.[size] ?? null;
      if (sameCellValue(value, previous)) return [];
      return [{ rowId: store.id, columnId: size, value, previous }];
    }),
  );
}

const allToWarehouse: FillRule = (store, size) =>
  store.id === WAREHOUSE ? (RECEIVED[size] ?? 0) : null;

const clearAll: FillRule = () => null;

// The stores in the order they are served: the current store first, the
// e-shop last, the warehouse taking what is left.
const SERVED_STORES = [
  ...STORES.filter((store) => store.id === CURRENT_STORE),
  ...STORES.filter(
    (store) => store.id !== CURRENT_STORE && store.id !== WAREHOUSE,
  ),
];

/** Tops each store up to its minimum, size by size; the rest goes to the warehouse. */
function byMinimumStock(): StoreQuantities {
  const split: StoreQuantities = Object.fromEntries(
    STORES.map((store) => [store.id, {}]),
  );
  for (const size of SIZES) {
    let left = RECEIVED[size] ?? 0;
    for (const store of SERVED_STORES.filter((candidate) =>
      isInRange(candidate, size),
    )) {
      const given = Math.min(
        left,
        Math.max(0, store.minimum - stockOf(store, size)),
      );
      if (given) split[store.id]![size] = given;
      left -= given;
    }
    if (left) split[WAREHOUSE]![size] = left;
  }
  return split;
}

const toMinimumStock: FillRule = (store, size) =>
  byMinimumStock()[store.id]?.[size] ?? null;

/**
 * The routes of the "Reception allocation" demo: the split of a delivery
 * between the stores (saved together, only when every size adds up), the
 * three fills computed here, and the stock correction saved cell by cell.
 */
export class MatrixAllocationController extends Controller(
  MATRIX_ALLOCATION_API,
) {
  @AuthUserWithPermission(PageMatrixAllocation)
  declare user: User;

  @Get("rows")
  list(): MatrixData {
    return { rows: STORES.map(allocationRow) };
  }

  // Atomic: a split is written whole or not at all, a delivery being split
  // once. The grid already waits for the targets (blockSave); the route
  // checks them again.
  @Post("save")
  save(@JSONBody() body: MatrixSaveRequest): MatrixSaveResponse {
    const { changes } = readSaveRequest(body);
    const refused = changes.flatMap((change) => {
      const problem = quantityProblem(change);
      return problem ? [cellError(change, problem)] : [];
    });
    if (refused.length) return { errors: refused };
    const proposed = copyOf(allocation);
    for (const change of changes) setQuantity(proposed, change);
    const unbalanced = unbalancedErrors(proposed, changes);
    if (unbalanced.length) return { errors: unbalanced };
    Object.assign(allocation, proposed);
    return { rows: STORES.map(allocationRow) };
  }

  @Post("fill/warehouse")
  fillWarehouse(@JSONBody() body: MatrixFillRequest) {
    return { changes: fillChanges(body, allToWarehouse) };
  }

  @Post("fill/minimum")
  fillMinimum(@JSONBody() body: MatrixFillRequest) {
    return { changes: fillChanges(body, toMinimumStock) };
  }

  @Post("fill/clear")
  fillClear(@JSONBody() body: MatrixFillRequest) {
    return { changes: fillChanges(body, clearAll) };
  }

  @Get("correction/rows")
  correction(): MatrixData {
    return { rows: STORES.map(correctionRow) };
  }

  @Post("correction/save")
  saveCorrection(@JSONBody() body: MatrixSaveRequest): MatrixSaveResponse {
    const { changes } = readSaveRequest(body);
    const errors: MatrixCellError[] = [];
    for (const change of changes) {
      const problem =
        quantityProblem(change) ??
        (change.value === null
          ? "Indiquez le nombre compté, 0 s'il n'y en a plus."
          : undefined);
      if (problem) errors.push(cellError(change, problem));
      else setQuantity(counted, change);
    }
    const rowIds = new Set(changes.map((change) => change.rowId));
    return {
      rows: STORES.filter((store) => rowIds.has(store.id)).map(correctionRow),
      errors,
    };
  }

  @Post("reset")
  reset() {
    resetAllocationDemo();
    return { message: "Démo remise à zéro" };
  }
}
