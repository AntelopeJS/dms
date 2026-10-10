import {
  Context,
  Controller,
  Get,
  type RequestContext,
} from "@antelopejs/interface-api";

/** A request the demo API "served", listed by the request log table. */
export interface RequestLogEntry {
  _id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  at: string;
}

const METHODS = ["GET", "POST", "PUT", "DELETE"];
const PATHS = [
  "/api/orders",
  "/api/customers",
  "/api/invoices/42",
  "/api/health",
  "/api/search?q=shoes&page=2",
];
const STATUSES = [200, 200, 200, 201, 204, 404, 500];
const ENTRY_COUNT = 120;
const MINUTE_MS = 60_000;
const METHOD_FILTER_KEY = "filter_method";
const ROUTE_KEY = "route";

// A fixed log: the same seed lists the same requests on every run.
const ENTRIES: RequestLogEntry[] = Array.from(
  { length: ENTRY_COUNT },
  (_, index) => ({
    _id: `req-${index + 1}`,
    method: METHODS[index % METHODS.length]!,
    path: PATHS[(index * 7) % PATHS.length]!,
    status: STATUSES[(index * 5) % STATUSES.length]!,
    durationMs: 40 + ((index * 37) % 900),
    at: new Date(Date.UTC(2026, 9, 5, 12) - index * MINUTE_MS).toISOString(),
  }),
);

/**
 * The route behind the "Request log" table (`TableView.fromSource`): it
 * filters on the method itself (`filter_method=is:GET`) and answers every
 * matching row, the browser searching, sorting and paging them. It pages
 * only when sent `offset` and `limit`.
 */
export class RequestLogController extends Controller(
  "/api/playground/request-log",
) {
  @Get("/")
  list(@Context() ctx: RequestContext) {
    const query = ctx.url.searchParams;
    const method = query.get(METHOD_FILTER_KEY)?.replace(/^is:/, "");
    const rows = method
      ? ENTRIES.filter((entry) => entry.method === method)
      : ENTRIES;
    const offset = Number(query.get("offset")) || 0;
    const limit = Number(query.get("limit")) || rows.length;
    return { results: rows.slice(offset, offset + limit), total: rows.length };
  }

  /**
   * The requests of one route, `?route=GET /api/orders`: the "Requests of a
   * route" table names it with `{{query.route}}`, which the browser encodes.
   */
  @Get("/route")
  ofRoute(@Context() ctx: RequestContext) {
    const route = ctx.url.searchParams.get(ROUTE_KEY);
    const rows = ENTRIES.filter(
      (entry) => `${entry.method} ${entry.path}` === route,
    );
    return { results: rows, total: rows.length };
  }
}
