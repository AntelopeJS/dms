import {
  Context,
  Controller,
  Get,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type {
  MatrixCellError,
  MatrixCellState,
  MatrixCellValue,
  MatrixChange,
  MatrixConflict,
  MatrixData,
  MatrixRow,
  MatrixSaveRequest,
  MatrixSaveResponse,
} from "@antelopejs/interface-dms/base/matrix-types";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { z } from "zod";
import {
  facetAllows,
  filtersAllow,
  facetItems,
  type MatrixQuery,
  matchesSearch,
  pageOf,
  readMatrixQuery,
  sortItems,
} from "../query";
import {
  type CellStates,
  cellError,
  conflictOf,
  readSaveRequest,
  rowError,
  type SaveRequest,
  touchedRowIds,
} from "../save";
import {
  HTTP_METHODS,
  PURGED_REF,
  REQUEST_DOCUMENTS,
  REQUEST_LABELS,
  type RequestDocument,
  type RequestField,
} from "./data";
import { MATRIX_RECORDS_API, PageMatrixRecords } from "./page";

const STATUS_CLASS_SIZE = 100;
const LOWEST_STATUS = 100;
const HIGHEST_STATUS = 599;
const CLIENT_ERROR = 400;
const SERVER_ERROR = 500;
const SLOW_MS = 900;
const MAX_PATH_LENGTH = 2048;
const MAX_NOTE_LENGTH = 4000;
const GROUP_BY_KEY = "groupBy";

const STATUS_CLASSES = {
  "2xx": "2xx Success",
  "3xx": "3xx Redirect",
  "4xx": "4xx Client error",
  "5xx": "5xx Server error",
} satisfies Record<string, string>;

const DOCUMENT_KEYS: (keyof RequestDocument)[] = [
  "_id",
  "ref",
  "method",
  "path",
  "status",
  "durationMs",
  "cached",
  "receivedAt",
  "client",
  "headers",
  "body",
  "sql",
  "labels",
  "notes",
];

type ChangeValue = MatrixChange["value"];

/** Why a value does not fit its field, or `undefined` when it does. */
type FieldCheck = (value: ChangeValue) => string | undefined;

/** A field's value schema, and what a value it refuses is told. */
const fieldCheck =
  (schema: z.ZodType, message: string): FieldCheck =>
  (value) =>
    schema.safeParse(value).success ? undefined : message;

const FIELD_CHECKS: Record<RequestField, FieldCheck> = {
  method: fieldCheck(
    z.enum(HTTP_METHODS),
    `Expected one of ${HTTP_METHODS.join(", ")}.`,
  ),
  path: fieldCheck(
    z.string().startsWith("/").max(MAX_PATH_LENGTH),
    "A path starts with /.",
  ),
  status: fieldCheck(
    z.number().int().min(LOWEST_STATUS).max(HIGHEST_STATUS),
    `An HTTP status is a whole number from ${LOWEST_STATUS} to ${HIGHEST_STATUS}.`,
  ),
  durationMs: fieldCheck(
    z.number().finite().min(0).nullable(),
    "A duration is a positive number of milliseconds, or null.",
  ),
  cached: fieldCheck(z.boolean(), "Expected true or false."),
  receivedAt: fieldCheck(
    z.string().refine((value) => !Number.isNaN(Date.parse(value))),
    "Expected a date.",
  ),
  client: fieldCheck(
    z.string().trim().min(1).nullable(),
    "A client is a name, or null for an anonymous call.",
  ),
  headers: fieldCheck(
    z.record(z.string()),
    "Headers are names with text values.",
  ),
  body: fieldCheck(
    z.union([z.null(), z.array(z.unknown()), z.record(z.unknown())]),
    "A request body is an object, an array or null.",
  ),
  sql: fieldCheck(z.string().trim().min(1), "The statement cannot be empty."),
  labels: fieldCheck(
    z.array(z.string().refine((label) => REQUEST_LABELS.includes(label))),
    `Labels are among ${REQUEST_LABELS.join(", ")}.`,
  ),
  notes: fieldCheck(
    z.string().max(MAX_NOTE_LENGTH).nullable(),
    `A note holds ${MAX_NOTE_LENGTH} characters at most.`,
  ),
};

function isDocumentKey(columnId: string): columnId is keyof RequestDocument {
  return DOCUMENT_KEYS.some((key) => key === columnId);
}

function isWritableField(columnId: string): columnId is RequestField {
  return columnId in FIELD_CHECKS;
}

function statusClass(status: number): string {
  return `${Math.floor(status / STATUS_CLASS_SIZE)}xx`;
}

function statusTone(status: number): MatrixCellState["tone"] {
  if (status >= SERVER_ERROR) return "error";
  if (status >= CLIENT_ERROR) return "warning";
  return undefined;
}

function cellStates(document: RequestDocument): CellStates {
  const cells: CellStates = {};
  const tone = statusTone(document.status);
  if (tone) cells.status = { tone };
  if (document.durationMs === null) {
    cells.durationMs = { tone: "error", placeholder: "timed out" };
  } else if (document.durationMs > SLOW_MS) {
    cells.durationMs = { tone: "warning" };
  }
  return cells;
}

function toRow(document: RequestDocument): MatrixRow {
  return {
    id: document._id,
    label: document.ref,
    values: { ...document },
    cells: cellStates(document),
  };
}

function readField(
  document: RequestDocument,
  columnId: string,
): MatrixCellValue | undefined {
  return isDocumentKey(columnId) ? document[columnId] : undefined;
}

function searchDocuments(query: MatrixQuery): RequestDocument[] {
  return REQUEST_DOCUMENTS.filter((document) =>
    matchesSearch(query.search, [
      document.ref,
      document._id,
      document.path,
      document.client,
      document.notes,
    ]),
  );
}

/**
 * The rows ordered on the field a grouped grid groups on (`?groupBy=method`),
 * the requested sort kept inside each group: a group's rows follow each other,
 * as `grouping.groupByField` expects.
 */
function groupedFirst(
  documents: RequestDocument[],
  field: string | null,
): RequestDocument[] {
  if (!field || !isDocumentKey(field)) return documents;
  return sortItems(
    documents,
    {
      offset: 0,
      search: "",
      direction: "asc",
      facets: {},
      filters: {},
      sort: field,
    },
    readField,
  );
}

function findDocument(id: string): RequestDocument | undefined {
  return REQUEST_DOCUMENTS.find((document) => document._id === id);
}

/** The outcome of one change: written, refused, or made on a moved value. */
interface ChangeOutcome {
  error?: MatrixCellError;
  conflict?: MatrixConflict;
}

function applyChange(
  document: RequestDocument,
  change: MatrixChange,
  request: SaveRequest,
): ChangeOutcome {
  const { columnId } = change;
  if (!isWritableField(columnId)) {
    return { error: cellError(change, `${columnId} is read-only.`) };
  }
  const problem = FIELD_CHECKS[columnId](change.value);
  if (problem) return { error: cellError(change, problem) };
  const conflict = conflictOf(request, change, document[columnId]);
  if (conflict) return { conflict };
  Object.assign(document, { [columnId]: change.value });
  return {};
}

function saveRow(rowId: string, request: SaveRequest): ChangeOutcome[] {
  const document = findDocument(rowId);
  if (!document) {
    return [{ error: rowError(rowId, "This document no longer exists.") }];
  }
  if (document.ref === PURGED_REF) {
    return [
      {
        error: rowError(
          rowId,
          "The retention job purged this document after you opened the page: reload to drop it.",
        ),
      },
    ];
  }
  return request.changes
    .filter((change) => change.rowId === rowId)
    .map((change) => applyChange(document, change, request));
}

/**
 * The routes of the "Records" demo: a collection browser over the
 * in-memory `api_requests` documents. The list searches, filters, sorts and
 * pages on the server, column filters included; the save checks each cell
 * against its field (and its `previous` when the block detects conflicts)
 * and answers the rows it wrote, and a row error for the purged document.
 */
export class MatrixRecordsController extends Controller(MATRIX_RECORDS_API) {
  @AuthUserWithPermission(PageMatrixRecords)
  declare user: User;

  @Get("rows")
  list(@Context() ctx: RequestContext): MatrixData {
    const query = readMatrixQuery(ctx.url.searchParams);
    const searched = searchDocuments(query);
    const byMethod = searched.filter(
      (document) =>
        facetAllows(query, "method", document.method) &&
        filtersAllow(query, document, readField),
    );
    const matching = byMethod.filter((document) =>
      facetAllows(query, "status", statusClass(document.status)),
    );
    const sorted = groupedFirst(
      sortItems(matching, query, readField),
      ctx.url.searchParams.get(GROUP_BY_KEY),
    );
    return {
      rows: pageOf(sorted, query).map(toRow),
      total: matching.length,
      facets: {
        status: facetItems(
          byMethod,
          (document) => statusClass(document.status),
          STATUS_CLASSES,
        ),
      },
    };
  }

  @Post("save")
  save(@JSONBody() body: MatrixSaveRequest): MatrixSaveResponse {
    const request = readSaveRequest(body);
    const rowIds = touchedRowIds(request.changes);
    const outcomes = rowIds.flatMap((rowId) => saveRow(rowId, request));
    const rows = rowIds
      .map(findDocument)
      .filter((document): document is RequestDocument => !!document)
      .filter((document) => document.ref !== PURGED_REF)
      .map(toRow);
    return {
      rows,
      errors: outcomes.flatMap(({ error }) => (error ? [error] : [])),
      conflicts: outcomes.flatMap(({ conflict }) =>
        conflict ? [conflict] : [],
      ),
    };
  }
}
