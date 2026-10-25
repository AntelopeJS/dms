import { HTTPResult } from "@antelopejs/interface-api";
import type {
  MatrixCellError,
  MatrixChange,
  MatrixConflict,
  MatrixRow,
  MatrixSaveRequest,
} from "@antelopejs/interface-dms/base/matrix-types";
import { type MatrixQuery, readMatrixQuery } from "./query";

const HTTP_BAD_REQUEST = 400;
const JSON_TYPE = "application/json";

/** A 400 naming what the request got wrong, as the playground's routes answer. */
export function badRequest(message: string): HTTPResult {
  return new HTTPResult(
    HTTP_BAD_REQUEST,
    JSON.stringify({ message }),
    JSON_TYPE,
  );
}

function isChange(change: MatrixChange | null | undefined): boolean {
  return (
    !!change &&
    typeof change.rowId === "string" &&
    typeof change.columnId === "string"
  );
}

/** A save request checked for its shape, with the list query it was sent from. */
export interface SaveRequest {
  changes: MatrixChange[];
  /** Whether `previous` is checked: the block's `conflicts: "detect"`, unless forced. */
  detectsConflicts: boolean;
  /** The grid's list query (search, status, facets, filters), for the `counts` answered. */
  query: MatrixQuery;
}

function listQuery(query: MatrixSaveRequest["query"]): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}

/**
 * The changes a `saveUrl` received, checked for their shape: a body that is
 * not a {@link MatrixSaveRequest} fails the whole request with a 400. A
 * route checks `previous` only when the block detects conflicts and the user
 * did not choose Overwrite.
 */
export function readSaveRequest(
  body: MatrixSaveRequest | undefined,
): SaveRequest {
  const changes = body?.changes;
  if (!Array.isArray(changes) || !changes.every(isChange)) {
    throw badRequest("Expected { changes: [{ rowId, columnId, value }] }.");
  }
  return {
    changes,
    detectsConflicts: body?.conflicts === "detect" && body.force !== true,
    query: readMatrixQuery(listQuery(body?.query)),
  };
}

/**
 * The conflict of a change whose stored value moved since the edit started,
 * when the request detects conflicts; `undefined` when it may be written.
 */
export function conflictOf(
  request: SaveRequest,
  change: MatrixChange,
  current: MatrixChange["value"],
): MatrixConflict | undefined {
  if (!request.detectsConflicts || sameCellValue(change.previous, current)) {
    return undefined;
  }
  return { rowId: change.rowId, columnId: change.columnId, current };
}

/**
 * What a fill action received: the rows as the grid shows them and, on a
 * `selectable` grid, the ids of the checked rows.
 */
export interface MatrixFillRequest {
  rows?: MatrixRow[];
  selected?: string[];
}

/** A refusal of one cell, or of a whole row without `columnId`. */
export function cellError(
  change: Pick<MatrixChange, "rowId" | "columnId">,
  message: string,
): MatrixCellError {
  return { rowId: change.rowId, columnId: change.columnId, message };
}

/** A refusal of a whole row: the row is gone, or locked. */
export function rowError(rowId: string, message: string): MatrixCellError {
  return { rowId, message };
}

function normalized(value: MatrixChange["value"]): string {
  if (value === null || value === undefined || value === "") return "";
  return JSON.stringify(value);
}

/**
 * Whether two cell values are the same for a conflict check: an empty
 * string, `null` and an absent value all mean an empty cell.
 */
export function sameCellValue(
  left: MatrixChange["value"],
  right: MatrixChange["value"],
): boolean {
  return normalized(left) === normalized(right);
}

/** The ids of the rows a request touched, once each, in their order. */
export function touchedRowIds(changes: MatrixChange[]): string[] {
  return [...new Set(changes.map((change) => change.rowId))];
}
