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
  type JsonValue,
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

/** A JSON value, checked to its last nested one: a request's body. */
const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(jsonValue),
  ]),
);

/** The value each writable field takes. */
const FIELD_SCHEMAS = {
  method: z.enum(HTTP_METHODS),
  path: z.string().startsWith("/").max(MAX_PATH_LENGTH),
  status: z.number().int().min(LOWEST_STATUS).max(HIGHEST_STATUS),
  durationMs: z.number().finite().min(0).nullable(),
  cached: z.boolean(),
  receivedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  client: z.string().trim().min(1).nullable(),
  headers: z.record(z.string()),
  body: z.union([z.null(), z.array(jsonValue), z.record(jsonValue)]),
  sql: z.string().trim().min(1),
  labels: z.array(z.string().refine((label) => REQUEST_LABELS.includes(label))),
  notes: z.string().max(MAX_NOTE_LENGTH).nullable(),
} satisfies Record<RequestField, z.ZodType>;

/** A change to one writable field, parsed into the document's own types. */
const FIELD_WRITE = z.object(FIELD_SCHEMAS).partial().strict();

/** What a value a field refuses is told. */
const FIELD_MESSAGES: Record<RequestField, string> = {
  method: `Expected one of ${HTTP_METHODS.join(", ")}.`,
  path: "A path starts with /.",
  status: `An HTTP status is a whole number from ${LOWEST_STATUS} to ${HIGHEST_STATUS}.`,
  durationMs: "A duration is a positive number of milliseconds, or null.",
  cached: "Expected true or false.",
  receivedAt: "Expected a date.",
  client: "A client is a name, or null for an anonymous call.",
  headers: "Headers are names with text values.",
  body: "A request body is an object, an array or null.",
  sql: "The statement cannot be empty.",
  labels: `Labels are among ${REQUEST_LABELS.join(", ")}.`,
  notes: `A note holds ${MAX_NOTE_LENGTH} characters at most.`,
};

function isDocumentKey(columnId: string): columnId is keyof RequestDocument {
  return DOCUMENT_KEYS.some((key) => key === columnId);
}

function isWritableField(columnId: string): columnId is RequestField {
  return Object.hasOwn(FIELD_SCHEMAS, columnId);
}

function statusClass(status: number): string {
  return `${Math.floor(status / STATUS_CLASS_SIZE)}xx`;
}

function statusTone(status: number): MatrixCellState["tone"] {
  if (status >= SERVER_ERROR) return "error";
  if (status >= CLIENT_ERROR) return "warning";
  return undefined;
}

function cellStates(stored: RequestDocument): CellStates {
  const cells: CellStates = {};
  const tone = statusTone(stored.status);
  if (tone) cells.status = { tone };
  if (stored.durationMs === null) {
    cells.durationMs = { tone: "error", placeholder: "timed out" };
  } else if (stored.durationMs > SLOW_MS) {
    cells.durationMs = { tone: "warning" };
  }
  return cells;
}

function toRow(stored: RequestDocument): MatrixRow {
  return {
    id: stored._id,
    label: stored.ref,
    values: { ...stored },
    cells: cellStates(stored),
  };
}

function readField(
  stored: RequestDocument,
  columnId: string,
): MatrixCellValue | undefined {
  return isDocumentKey(columnId) ? stored[columnId] : undefined;
}

function searchDocuments(query: MatrixQuery): RequestDocument[] {
  return REQUEST_DOCUMENTS.filter((stored) =>
    matchesSearch(query.search, [
      stored.ref,
      stored._id,
      stored.path,
      stored.client,
      stored.notes,
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
  return REQUEST_DOCUMENTS.find((stored) => stored._id === id);
}

/** The outcome of one change: written, refused, or made on a moved value. */
interface ChangeOutcome {
  error?: MatrixCellError;
  conflict?: MatrixConflict;
}

function applyChange(
  stored: RequestDocument,
  change: MatrixChange,
  request: SaveRequest,
): ChangeOutcome {
  const { columnId } = change;
  if (!isWritableField(columnId)) {
    return { error: cellError(change, `${columnId} is read-only.`) };
  }
  const written = FIELD_WRITE.safeParse({ [columnId]: change.value });
  if (!written.success)
    return { error: cellError(change, FIELD_MESSAGES[columnId]) };
  const conflict = conflictOf(request, change, stored[columnId]);
  if (conflict) return { conflict };
  Object.assign(stored, written.data);
  return {};
}

function saveRow(rowId: string, request: SaveRequest): ChangeOutcome[] {
  const stored = findDocument(rowId);
  if (!stored) {
    return [{ error: rowError(rowId, "This document no longer exists.") }];
  }
  if (stored.ref === PURGED_REF) {
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
    .map((change) => applyChange(stored, change, request));
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
      (stored) =>
        facetAllows(query, "method", stored.method) &&
        filtersAllow(query, stored, readField),
    );
    const matching = byMethod.filter((stored) =>
      facetAllows(query, "status", statusClass(stored.status)),
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
          (stored) => statusClass(stored.status),
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
      .filter((stored): stored is RequestDocument => !!stored)
      .filter((stored) => stored.ref !== PURGED_REF)
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
