import type { PassThrough } from "node:stream";
import {
  Context,
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Put,
  type RequestContext,
  WriteStream,
} from "@antelopejs/interface-api";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";
import type { z } from "zod";
import { authorOf } from "./review";
import { registerReviewRoutes } from "./review-routes";
import {
  findRow,
  listRows,
  MOCKUP_API,
  parseRows,
  parseRowsQuery,
  type RowsPage,
} from "./fixtures";
import { readExampleSpec } from "./example";
import { buildMockupSchema } from "./json-schema";
import type { Json, JsonObject, MockupName, MockupState } from "./model";
import { MockupOwnerController } from "./owner-controller";
import { type MockupSubject, notFound } from "./refusals";
import { parseViewerId } from "./presence";
import { PresenceBoard } from "./presence-board";
import { registerPresenceRoutes } from "./presence-routes";
import {
  fixtureKeySchema,
  jsonObjectSchema,
  pageIdSchema,
  parseMockupName,
} from "./model";
import { registerFromPageRoute } from "./from-page-routes";
import { BUILDER_PAGES, type LivePages } from "./live-page";
import { registerHistoryRoutes } from "./history-routes";
import type {
  MockupCreated,
  MockupEvent,
  MockupStore,
  MockupSummary,
} from "./store";
import { registerManageRoutes } from "./manage-routes";
import { registerSpecRoutes } from "./source-routes";

const HTTP_BAD_REQUEST = 400;
const SSE_CONTENT_TYPE = "text/event-stream";
const SSE_RECONNECT_MS = 1000;
const SSE_HELLO = `retry: ${SSE_RECONNECT_MS}\n: connected\n\n`;

/** The bulk routes a table in archive mode sends its rows to. */
const ARCHIVE_CHANGES: ReadonlySet<string> = new Set(["archive", "restore"]);

/** The mockup files, the event streams open on them, who is on each mockup, and the live pages a conversion reads. */
export interface MockupEngine {
  store: MockupStore;
  streams: Set<PassThrough>;
  presence: PresenceBoard;
  pages: LivePages;
}

/** An engine over `store` with no stream open and nobody on any mockup. */
export function createMockupEngine(
  store: MockupStore,
  presence = new PresenceBoard(store),
  pages: LivePages = BUILDER_PAGES,
): MockupEngine {
  return { store, streams: new Set(), presence, pages };
}

/** The row of `rows` that `?id=` names, read at `?key=` when the query gives one. */
function rowOf(
  rows: readonly JsonObject[],
  query: URLSearchParams,
): JsonObject | undefined {
  const id = query.get("id");
  return id === null
    ? undefined
    : findRow(rows, id, query.get("key") ?? undefined);
}

/** Refuses any name that is not a mockup directory name, before any path is built. */
function nameOf(raw: string): MockupName {
  const name = parseMockupName(raw);
  if (!name) throw notFound("mockup");
  return name;
}

function checkParam(
  schema: z.ZodType<string>,
  raw: string,
  what: MockupSubject,
): string {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

/** The fixture `rawKey` of the page `rawPage` of the mockup `rawName`, or a 404 naming what is missing. */
async function readFixture(
  store: MockupStore,
  rawName: string,
  rawPage: string,
  rawKey: string,
): Promise<Json> {
  const name = nameOf(rawName);
  const page = checkParam(pageIdSchema, rawPage, "page");
  const key = checkParam(fixtureKeySchema, rawKey, "fixture");
  const fixture = await store.fixture(name, page, key);
  if (fixture === undefined) throw notFound("fixture");
  return fixture;
}

/** The rows of a fixture, or a 404 when it is not an array of row objects. */
async function readRows(
  store: MockupStore,
  rawName: string,
  rawPage: string,
  rawKey: string,
): Promise<JsonObject[]> {
  const rows = parseRows(await readFixture(store, rawName, rawPage, rawKey));
  if (!rows) throw notFound("rows");
  return rows;
}

function formatEvent(event: MockupEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function formatCreated(created: MockupCreated): string {
  return `event: created\ndata: ${JSON.stringify(created)}\n\n`;
}

function write(out: PassThrough, payload: string): void {
  try {
    out.write(payload);
  } catch {
    out.destroy();
  }
}

/**
 * Registers the mockup API under `/api/mockup`. Development only: it serves
 * the files of the project it runs in. The platform owner reaches every
 * route; a member whose role reviews mockups reaches what draws a mockup and
 * comments on it, never what writes its files, locks its blocks, lists its
 * versions or manages it. The MCP mockup tools read the files directly, not
 * through these routes.
 */
export function registerMockupRoutes(engine: MockupEngine) {
  const { store } = engine;

  const fixtureOf = (rawName: string, rawPage: string, rawKey: string) =>
    readFixture(store, rawName, rawPage, rawKey);

  class MockupController extends Controller(MOCKUP_API, MockupOwnerController) {
    @Get("/")
    async list(): Promise<{ results: MockupSummary[]; total: number }> {
      await this.assertReviewer();
      const results = await store.list();
      return { results, total: results.length };
    }

    @Get("schema")
    async schema(): Promise<JsonObject> {
      await this.assertOwner();
      return buildMockupSchema(ListBlockTypes());
    }

    @Get("example")
    async example(): Promise<JsonObject> {
      await this.assertOwner();
      const spec = await readExampleSpec();
      if (!spec) throw notFound("example");
      return spec;
    }

    @Get(":name")
    async state(@Parameter("name") rawName: string): Promise<MockupState> {
      await this.assertReviewer();
      const state = await store.state(nameOf(rawName));
      if (!state) throw notFound("mockup");
      return state;
    }

    @Get(":name/events")
    async events(
      @Parameter("name") rawName: string,
      @WriteStream(SSE_CONTENT_TYPE) out: PassThrough,
      @Context() context: RequestContext,
    ): Promise<void> {
      const owner = authorOf(await this.reviewer());
      const name = nameOf(rawName);
      const id = parseViewerId(context.url.searchParams.get("viewer"));
      let unsubscribe: (() => void) | undefined;
      let leave: (() => void) | undefined;
      let open = !context.rawRequest.socket.destroyed;
      const drop = () => {
        if (!open) return;
        open = false;
        engine.streams.delete(out);
        unsubscribe?.();
        leave?.();
        out.end();
      };
      context.rawRequest.once("close", drop);
      out.on("close", drop);
      out.on("error", drop);
      const exists = await store.state(name);
      if (!exists) {
        context.rawRequest.off("close", drop);
        throw notFound("mockup");
      }
      if (!open) {
        out.end();
        return;
      }
      engine.streams.add(out);
      write(out, SSE_HELLO);
      unsubscribe = await store.subscribe(name, (event) =>
        write(out, formatEvent(event)),
      );
      if (!unsubscribe) out.end();
      else if (!open) unsubscribe();
      else {
        leave = engine.presence.open(name, id && { id, ...owner }, (presence) =>
          write(out, formatEvent({ event: "presence", data: presence })),
        );
      }
    }

    @Get(":name/pages/:page/fixtures/:key")
    async fixture(
      @Parameter("name") rawName: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
    ): Promise<Json> {
      await this.assertReviewer();
      return fixtureOf(rawName, rawPage, rawKey);
    }

    @Get(":name/pages/:page/fixtures/:key/rows")
    async rows(
      @Parameter("name") rawName: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
      @Context() context: RequestContext,
    ): Promise<RowsPage> {
      await this.assertReviewer();
      const rows = parseRows(await fixtureOf(rawName, rawPage, rawKey));
      if (!rows) throw notFound("rows");
      return listRows(rows, parseRowsQuery(context.url.searchParams));
    }

    /** The rows where a data controller's list route stands, which a kanban board reads. */
    @Get(":name/pages/:page/fixtures/:key/rows/list")
    async rowsList(
      @Parameter("name") rawName: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
      @Context() context: RequestContext,
    ): Promise<RowsPage> {
      return this.rows(rawName, rawPage, rawKey, context);
    }
  }
  registerCreatedRoute(engine);
  registerReviewRoutes(store.mockupsDir);
  registerRecordRoutes(store);
  registerSpecRoutes(store.mockupsDir, engine.presence);
  registerPresenceRoutes(engine.presence, store.mockupsDir);
  registerHistoryRoutes(store.mockupsDir, engine.presence);
  registerManageRoutes(store.mockupsDir);
  registerFromPageRoute(store.mockupsDir, engine.presence, engine.pages);
  return MockupController;
}

/**
 * The stream of created mockups, `GET /api/mockup/events/created`: a
 * `created` event, `{ name, title? }`, for each mockup whose spec did not
 * exist before. The mockups there already, and the changes to a mockup, send
 * nothing. Its first frame comes once the mockups there are known, so a
 * mockup made after it is always sent.
 */
function registerCreatedRoute(engine: MockupEngine) {
  const { store } = engine;
  class MockupCreatedController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    @Get("events/created")
    async createdEvents(
      @WriteStream(SSE_CONTENT_TYPE) out: PassThrough,
      @Context() context: RequestContext,
    ): Promise<void> {
      await this.assertOwner();
      let unsubscribe: (() => void) | undefined;
      let open = !context.rawRequest.socket.destroyed;
      const drop = () => {
        if (!open) return;
        open = false;
        engine.streams.delete(out);
        unsubscribe?.();
        out.end();
      };
      context.rawRequest.once("close", drop);
      out.on("close", drop);
      out.on("error", drop);
      if (!open) {
        out.end();
        return;
      }
      engine.streams.add(out);
      unsubscribe = await store.subscribeCreated((created) =>
        write(out, formatCreated(created)),
      );
      if (!open) unsubscribe();
      else write(out, SSE_HELLO);
    }
  }
  return MockupCreatedController;
}

/**
 * The routes a sub-page and a table's forms reach a fixture's rows through:
 * one row by id, as a record and where a data controller's `get` route
 * stands, the saves of the add and edit forms, which answer the row and
 * keep nothing, and the archive and restore of a table in archive mode.
 */
function registerRecordRoutes(store: MockupStore) {
  class MockupRecordController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    /** The row of a fixture's rows whose `_id`, else `id`, is `?id=`: what a sub-page with a route shows. */
    @Get(":name/pages/:page/fixtures/:key/record")
    async record(
      @Parameter("name") rawName: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
      @Context() context: RequestContext,
    ): Promise<JsonObject> {
      await this.assertReviewer();
      const rows = await readRows(store, rawName, rawPage, rawKey);
      const row = rowOf(rows, context.url.searchParams);
      if (!row) throw notFound("row");
      return row;
    }

    /** The row a table's details view reads, `<rows>/get?id=`, where a data controller's `get` route stands: the row the record route answers. */
    @Get(":name/pages/:page/fixtures/:key/rows/get")
    async get(
      @Parameter("name") rawName: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
      @Context() context: RequestContext,
    ): Promise<JsonObject> {
      return this.record(rawName, rawPage, rawKey, context);
    }

    /** Where a table's add and edit forms save: it answers the row `?id=` names, if any, with the changes it was sent, and keeps nothing. */
    @Put(":name/pages/:page/fixtures/:key/rows")
    async save(
      @Parameter("name") rawName: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
      @Context() context: RequestContext,
      @JSONBody() body: unknown,
    ): Promise<JsonObject> {
      await this.assertReviewer();
      const rows = await readRows(store, rawName, rawPage, rawKey);
      const sent = jsonObjectSchema.safeParse(body);
      if (!sent.success) {
        throw new HTTPResult(HTTP_BAD_REQUEST, {
          message: "$dms.refusals.mockup.row_not_object",
        });
      }
      return { ...rowOf(rows, context.url.searchParams), ...sent.data };
    }

    /** Where a table in archive mode archives and restores rows, `<rows>/archive` and `<rows>/restore`: it answers that every row went, and keeps nothing. */
    @Put(":name/pages/:page/fixtures/:key/rows/:change")
    async archive(
      @Parameter("name") rawName: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
      @Parameter("change") change: string,
    ): Promise<JsonObject> {
      await this.assertReviewer();
      if (!ARCHIVE_CHANGES.has(change)) throw notFound("route");
      await readRows(store, rawName, rawPage, rawKey);
      return {};
    }
  }
  return MockupRecordController;
}

/**
 * Ends every open event stream, and with them the viewers and the locks they
 * held; a browser's EventSource reconnects later.
 */
export function closeMockupStreams(engine: MockupEngine): void {
  const streams = [...engine.streams];
  engine.streams.clear();
  engine.presence.close();
  for (const stream of streams) stream.end();
}
