import {
  Context,
  Controller,
  Get,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { PublishMessage } from "@antelopejs/interface-dms/realtime";

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
const BATCH_SIZE = 3;
const BACKGROUND_BATCH_DELAY_MS = 2_000;
const ROUTE_KEY = "route";

/** Published once a background batch landed; the request log table follows it. */
export const REQUEST_LOG_TOPIC = "playground:request-log";
const REQUEST_LOG_BATCH_EVENT = "request-log.batch";

function buildEntry(sequence: number, at: Date): RequestLogEntry {
  return {
    _id: `req-${sequence}`,
    method: METHODS[sequence % METHODS.length]!,
    path: PATHS[(sequence * 7) % PATHS.length]!,
    status: STATUSES[(sequence * 5) % STATUSES.length]!,
    durationMs: 40 + ((sequence * 37) % 900),
    at: at.toISOString(),
  };
}

// A fixed log: the same seed lists the same requests on every run, newest
// first. The batch routes put new requests on top of it.
const ENTRIES: RequestLogEntry[] = Array.from(
  { length: ENTRY_COUNT },
  (_, index) =>
    buildEntry(
      ENTRY_COUNT - index,
      new Date(Date.UTC(2026, 9, 5, 12) - index * MINUTE_MS),
    ),
);

function appendBatch(): void {
  const now = new Date();
  const batch = Array.from({ length: BATCH_SIZE }, (_, index) =>
    buildEntry(ENTRIES.length + BATCH_SIZE - index, now),
  );
  ENTRIES.unshift(...batch);
}

async function appendBatchAndPublish(): Promise<void> {
  appendBatch();
  await PublishMessage(REQUEST_LOG_TOPIC, REQUEST_LOG_BATCH_EVENT);
}

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
   * Adds a batch of requests and says nothing: the page header button that
   * calls it refreshes the page's blocks, which reads the table again.
   */
  @Post("batch")
  importBatch() {
    appendBatch();
    return { ok: true };
  }

  /**
   * Adds a batch of requests a moment later, as a background job would, and
   * publishes on the topic the table follows.
   */
  @Post("batch/background")
  importBatchInBackground() {
    setTimeout(() => {
      appendBatchAndPublish().catch((error: unknown) => {
        console.warn("[playground] request log batch failed", error);
      });
    }, BACKGROUND_BATCH_DELAY_MS);
    return { ok: true };
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
