import { HTTPResult } from "@antelopejs/interface-api";
import type {
  MatrixCellError,
  MatrixChange,
  MatrixRow,
  MatrixSaveRequest,
} from "@antelopejs/interface-dms/base/matrix";

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

/**
 * The changes a `saveUrl` received, checked for their shape: a body that is
 * not a {@link MatrixSaveRequest} fails the whole request with a 400.
 */
export function readSaveRequest(
  body: MatrixSaveRequest | undefined,
): MatrixSaveRequest {
  const changes = body?.changes;
  if (!Array.isArray(changes) || !changes.every(isChange)) {
    throw badRequest("Expected { changes: [{ rowId, columnId, value }] }.");
  }
  return { changes, force: body?.force === true };
}

/** The rows a fill action received (`{ rows }`), as the grid shows them. */
export interface MatrixFillRequest {
  rows?: MatrixRow[];
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
