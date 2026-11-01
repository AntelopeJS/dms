import {
  Context,
  Controller,
  Get,
  HTTPResult,
  Parameter,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { Tone } from "@antelopejs/interface-dms/base/types/tone";
import {
  REQUEST_LOG_ENTRIES,
  type RequestLogEntry,
} from "../sources/request-log";
import { ownEntry } from "../../own-entry";

/**
 * A request as the "API request log" table lists it: keyed by `requestId`
 * (the table's `rowIdKey`), with the tones the server picks per row and the
 * previous request served on the same route, which the side panel opens
 * with `showRow`.
 */
export interface ServedRequest extends Omit<RequestLogEntry, "_id"> {
  requestId: string;
  statusTone: Tone;
  durationTone?: Tone;
  previousId?: string;
}

type EntryFilter = (entry: RequestLogEntry) => boolean;
type QueryFilter = (query: URLSearchParams) => EntryFilter | undefined;
type SortableField = keyof RequestLogEntry;

const HTTP_NOT_FOUND = 404;
const JSON_TYPE = "application/json";
const HTTP_CLASS_SIZE = 100;
const SLOW_REQUEST_MS = 600;
const DEFAULT_PAGE_SIZE = 20;
const FILTER_PREFIX = "filter_";
const FILTERABLE_FIELDS: SortableField[] = ["method", "status"];
const SORTABLE_FIELDS: SortableField[] = [
  "method",
  "path",
  "status",
  "durationMs",
  "at",
];
// oxlint-disable-next-line anti-slop/no-known-value-widening -- HTTP classes are computed numbers, not a closed key union supplied by the request-log contract.
const STATUS_TONES: Record<number, Tone> = {
  2: "success",
  3: "info",
  4: "warning",
  5: "error",
};

type FilterMode = (
  value: RequestLogEntry[SortableField],
  expected: string,
) => boolean;

// oxlint-disable-next-line anti-slop/no-known-value-widening -- Filter modes arrive as arbitrary query strings; inference would remove the string index signature used for missing modes.
const FILTER_MODES: Record<string, FilterMode> = {
  is: (value, expected) => String(value) === expected,
  greater_than_or_equal_to: (value, expected) =>
    Number(value) >= Number(expected),
};

function columnFilter(field: SortableField): QueryFilter {
  return (query) => {
    const raw = query.get(`${FILTER_PREFIX}${field}`);
    if (!raw) return undefined;
    const separator = raw.indexOf(":");
    const compare = ownEntry(FILTER_MODES, raw.slice(0, separator));
    const expected = raw.slice(separator + 1);
    return compare ? (entry) => compare(entry[field], expected) : undefined;
  };
}

const searchFilter: QueryFilter = (query) => {
  const search = query.get("search")?.trim().toLowerCase();
  if (!search) return undefined;
  return (entry) =>
    `${entry.method} ${entry.path}`.toLowerCase().includes(search);
};

const periodFilter: QueryFilter = (query) => {
  const from = query.get("from");
  const to = query.get("to");
  if (!from && !to) return undefined;
  return (entry) => (!from || entry.at >= from) && (!to || entry.at <= to);
};

const heldFilter: QueryFilter = (query) => {
  const heldAt = query.get("liveHeldAt");
  return heldAt ? (entry) => entry.at <= heldAt : undefined;
};

const QUERY_FILTERS: QueryFilter[] = [
  ...FILTERABLE_FIELDS.map(columnFilter),
  searchFilter,
  periodFilter,
  heldFilter,
];

/** The requests the query's search, column filters, period and live hold keep. */
export function filterEntries(query: URLSearchParams): RequestLogEntry[] {
  const filters = QUERY_FILTERS.map((build) => build(query)).filter(
    (filter): filter is EntryFilter => !!filter,
  );
  return REQUEST_LOG_ENTRIES.filter((entry) =>
    filters.every((filter) => filter(entry)),
  );
}

function sortEntries(
  entries: RequestLogEntry[],
  query: URLSearchParams,
): RequestLogEntry[] {
  const requestedKey = query.get("sortKey");
  const key = SORTABLE_FIELDS.find((field) => field === requestedKey);
  if (!key) return entries;
  const direction = query.get("sortDirection") === "desc" ? -1 : 1;
  return [...entries].sort((left, right) => {
    const a = left[key];
    const b = right[key];
    return (a < b ? -1 : a > b ? 1 : 0) * direction;
  });
}

function previousOnRoute(entry: RequestLogEntry): string | undefined {
  const index = REQUEST_LOG_ENTRIES.indexOf(entry);
  return REQUEST_LOG_ENTRIES.slice(index + 1).find(
    (older) => older.method === entry.method && older.path === entry.path,
  )?._id;
}

function serve(entry: RequestLogEntry): ServedRequest {
  const { _id, ...fields } = entry;
  const statusClass = Math.floor(entry.status / HTTP_CLASS_SIZE);
  return {
    ...fields,
    requestId: _id,
    statusTone: STATUS_TONES[statusClass] ?? "neutral",
    durationTone: entry.durationMs >= SLOW_REQUEST_MS ? "warning" : undefined,
    previousId: previousOnRoute(entry),
  };
}

/**
 * The routes of the "API request log" demo, over the same requests as the
 * Sources page's log, but doing on the server what the browser does there:
 * it searches, filters, sorts and pages (`capabilities`), follows the page's
 * period (`from` / `to`) and answers the rows as they stood at `liveHeldAt`
 * while the live page is paused. `/rows/:id` reads one request, for a link
 * to a request beyond the listed page (`fetchRowUrl`).
 */
export class RequestLogServerController extends Controller(
  "/api/playground/request-log-server",
) {
  @Get("/")
  list(@Context() ctx: RequestContext) {
    const query = ctx.url.searchParams;
    const rows = sortEntries(filterEntries(query), query);
    const offset = Number(query.get("offset")) || 0;
    const limit = Number(query.get("limit")) || DEFAULT_PAGE_SIZE;
    return {
      results: rows.slice(offset, offset + limit).map(serve),
      total: rows.length,
    };
  }

  @Get("/rows/:id")
  row(@Parameter("id", "param") id: string): ServedRequest {
    const entry = REQUEST_LOG_ENTRIES.find((candidate) => candidate._id === id);
    if (!entry) {
      throw new HTTPResult(
        HTTP_NOT_FOUND,
        JSON.stringify({ message: "Request not found" }),
        JSON_TYPE,
      );
    }
    return serve(entry);
  }
}
