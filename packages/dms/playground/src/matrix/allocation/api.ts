import { Controller, Get, JSONBody, Post } from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  MatrixCellError,
  MatrixCellState,
  MatrixChange,
  MatrixConflict,
  MatrixData,
  MatrixRow,
  MatrixSaveRequest,
  MatrixSaveResponse,
} from "@antelopejs/interface-dms/base/matrix-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import {
  badRequest,
  cellError,
  conflictOf,
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

/** The changes of a size column whose pairs do not add up to the delivery, and why. */
function unbalancedReasons(
  proposed: StoreQuantities,
  changes: MatrixChange[],
): Map<MatrixChange, string> {
  const reasons = new Map<MatrixChange, string>();
  for (const change of changes) {
    const size = change.columnId;
    const total = sizeTotal(proposed, size);
    const received = RECEIVED[size] ?? 0;
    if (total !== received) {
      reasons.set(
        change,
        `Pointure ${size} : ${total} paires réparties pour ${received} reçues.`,
      );
    }
  }
  return reasons;
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
 * Splits each size between the checked stores that ordered it, one pair at a
 * time in serving order; a size none of them ordered goes to the warehouse.
 */
function onCheckedStores(selected: string[]): StoreQuantities {
  const checked = [
    ...SERVED_STORES,
    ...STORES.filter((store) => store.id === WAREHOUSE),
  ].filter((store) => selected.includes(store.id));
  const split: StoreQuantities = Object.fromEntries(
    STORES.map((store) => [store.id, {}]),
  );
  for (const size of SIZES) {
    const takers = checked.filter((store) => isInRange(store, size));
    const pairs = RECEIVED[size] ?? 0;
    if (!takers.length) {
      if (pairs) split[WAREHOUSE]![size] = pairs;
      continue;
    }
    for (let pair = 0; pair < pairs; pair += 1) {
      const store = takers[pair % takers.length]!;
      split[store.id]![size] = (split[store.id]![size] ?? 0) + 1;
    }
  }
  return split;
}

/**
 * The checked rows the request names among the rows it posted: an id the
 * grid no longer shows (a stale selection) is ignored.
 */
function checkedIds(request: MatrixFillRequest | undefined): string[] {
  const selected = Array.isArray(request?.selected) ? request.selected : [];
  const shown = Array.isArray(request?.rows)
    ? new Set(request.rows.map((row) => row.id))
    : new Set(STORES.map((store) => store.id));
  return selected.filter((id) => shown.has(id));
}

function checkedRule(request: MatrixFillRequest | undefined): FillRule {
  const selected = checkedIds(request);
  if (!selected.length) {
    throw badRequest("Cochez d'abord les magasins à servir.");
  }
  const split = onCheckedStores(selected);
  return (store, size) => split[store.id]?.[size] ?? null;
}

const NOT_WRITTEN =
  "Non enregistré : la répartition est refusée en entier, voir les cases en erreur.";

/**
 * Every change of a refused split, each with its own reason or the reason
 * the whole split was refused: the grid keeps them all, none written.
 */
function refuseAll(
  changes: MatrixChange[],
  reasons: Map<MatrixChange, string>,
): MatrixCellError[] {
  return changes.map((change) =>
    cellError(change, reasons.get(change) ?? NOT_WRITTEN),
  );
}

function problemsOf(changes: MatrixChange[]): Map<MatrixChange, string> {
  const problems = new Map<MatrixChange, string>();
  for (const change of changes) {
    const problem = quantityProblem(change);
    if (problem) problems.set(change, problem);
  }
  return problems;
}

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
    const problems = problemsOf(changes);
    if (problems.size) return { errors: refuseAll(changes, problems) };
    const proposed = copyOf(allocation);
    for (const change of changes) setQuantity(proposed, change);
    const unbalanced = unbalancedReasons(proposed, changes);
    if (unbalanced.size) return { errors: refuseAll(changes, unbalanced) };
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

  @Post("fill/checked")
  fillChecked(@JSONBody() body: MatrixFillRequest) {
    return { changes: fillChanges(body, checkedRule(body)) };
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
    const request = readSaveRequest(body);
    const { changes } = request;
    const errors: MatrixCellError[] = [];
    const conflicts: MatrixConflict[] = [];
    for (const change of changes) {
      const problem =
        quantityProblem(change) ??
        (change.value === null
          ? "Indiquez le nombre compté, 0 s'il n'y en a plus."
          : undefined);
      const conflict = problem
        ? undefined
        : conflictOf(
            request,
            change,
            counted[change.rowId]?.[change.columnId] ?? null,
          );
      if (problem) errors.push(cellError(change, problem));
      else if (conflict) conflicts.push(conflict);
      else setQuantity(counted, change);
    }
    const rowIds = new Set(changes.map((change) => change.rowId));
    return {
      rows: STORES.filter((store) => rowIds.has(store.id)).map(correctionRow),
      errors,
      conflicts,
    };
  }

  @Post("reset")
  reset() {
    resetAllocationDemo();
    return { message: "Démo remise à zéro" };
  }
}
