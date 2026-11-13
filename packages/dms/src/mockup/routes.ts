import type { PassThrough } from "node:stream";
import {
  Context,
  Controller,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
  Route,
  WriteStream,
} from "@antelopejs/interface-api";
import { ListBlockTypes } from "@antelopejs/interface-dms/base/block-types";
import type { z } from "zod";
import {
  type AnnotationCreation,
  annotationDraftSchema,
  annotationPatchSchema,
  createAnnotation,
  listAnnotations,
  type MockupAnnotation,
  updateAnnotation,
} from "./annotations";
import {
  listRows,
  MOCKUP_API,
  parseRows,
  parseRowsQuery,
  type RowsPage,
} from "./fixtures";
import { buildMockupSchema } from "./json-schema";
import type { Json, JsonObject, MockupName, MockupState } from "./model";
import {
  annotationIdSchema,
  fixtureKeySchema,
  pageIdSchema,
  parseMockupName,
} from "./model";
import { registerFromPageRoute } from "./from-page-routes";
import type { MockupEvent, MockupStore, MockupSummary } from "./store";
import { registerSpecRoutes } from "./source-routes";

const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const SSE_CONTENT_TYPE = "text/event-stream";
const SSE_RECONNECT_MS = 1000;
const SSE_HELLO = `retry: ${SSE_RECONNECT_MS}\n: connected\n\n`;

/** The mockup files and the event streams open on them. */
export interface MockupEngine {
  store: MockupStore;
  streams: Set<PassThrough>;
}

function notFound(what: string): HTTPResult {
  return new HTTPResult(HTTP_NOT_FOUND, { message: `${what} not found` });
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
  what: string,
): string {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw notFound(what);
  return parsed.data;
}

function formatEvent(event: MockupEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function write(out: PassThrough, payload: string): void {
  try {
    out.write(payload);
  } catch {
    out.destroy();
  }
}

/**
 * Registers the mockup API under `/api/mockup`. Development only, and
 * unauthenticated: it serves the files of the project it runs in.
 */
export function registerMockupRoutes(engine: MockupEngine) {
  const { store } = engine;

  async function fixtureOf(
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

  class MockupController extends Controller(MOCKUP_API) {
    @Get("/")
    async list(): Promise<{ results: MockupSummary[]; total: number }> {
      const results = await store.list();
      return { results, total: results.length };
    }

    @Get("schema")
    schema(): JsonObject {
      return buildMockupSchema(ListBlockTypes());
    }

    @Get(":name")
    async state(@Parameter("name") rawName: string): Promise<MockupState> {
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
      const name = nameOf(rawName);
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
    }

    @Get(":name/pages/:page/fixtures/:key")
    fixture(
      @Parameter("name") rawName: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
    ): Promise<Json> {
      return fixtureOf(rawName, rawPage, rawKey);
    }

    @Get(":name/pages/:page/fixtures/:key/rows")
    async rows(
      @Parameter("name") rawName: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
      @Context() context: RequestContext,
    ): Promise<RowsPage> {
      const rows = parseRows(await fixtureOf(rawName, rawPage, rawKey));
      if (!rows) throw notFound("array of rows");
      return listRows(rows, parseRowsQuery(context.url.searchParams));
    }
  }
  registerAnnotationRoutes(store);
  registerSpecRoutes(store.mockupsDir);
  registerFromPageRoute(store.mockupsDir);
  return MockupController;
}

/** The refusal a creation that made no annotation answers with. */
function refusal(
  created: Exclude<AnnotationCreation, { kind: "created" }>,
): HTTPResult {
  switch (created.kind) {
    case "no_mockup":
      return notFound("mockup");
    case "no_node":
      return notFound("node at this page and path");
    case "ambiguous":
      return new HTTPResult(HTTP_CONFLICT, {
        message:
          "another block has the same ids as this one, so a note cannot tell them apart: give one of them another id",
      });
    case "spec_invalid":
      return new HTTPResult(HTTP_CONFLICT, {
        message:
          "spec.json is not a valid spec, so the note's block cannot get an id",
        errors: created.errors.map(({ path, message }) => ({ path, message })),
      });
  }
}

/** The annotation routes over the mockups of `store`. */
function registerAnnotationRoutes(store: MockupStore) {
  const { mockupsDir } = store;
  class MockupAnnotationController extends Controller(MOCKUP_API) {
    @Get(":name/annotations")
    async annotations(
      @Parameter("name") rawName: string,
    ): Promise<{ annotations: MockupAnnotation[] }> {
      const annotations = await listAnnotations(nameOf(rawName), mockupsDir);
      if (!annotations) throw notFound("mockup");
      return { annotations };
    }

    @Post(":name/annotations")
    async create(
      @Parameter("name") rawName: string,
      @JSONBody() body: unknown,
    ): Promise<MockupAnnotation> {
      const name = nameOf(rawName);
      const draft = annotationDraftSchema.safeParse(body);
      if (!draft.success) {
        throw new HTTPResult(HTTP_BAD_REQUEST, {
          message: draft.error.message,
        });
      }
      const created = await createAnnotation(name, draft.data, mockupsDir);
      if (created.kind !== "created") throw refusal(created);
      return created.annotation;
    }

    @Route("handler", "patch", ":name/annotations/:id")
    async update(
      @Parameter("name") rawName: string,
      @Parameter("id") rawId: string,
      @JSONBody() body: unknown,
    ): Promise<MockupAnnotation> {
      const name = nameOf(rawName);
      const id = annotationIdSchema.safeParse(rawId);
      if (!id.success) throw notFound("annotation");
      const patch = annotationPatchSchema.safeParse(body);
      if (!patch.success) {
        throw new HTTPResult(HTTP_BAD_REQUEST, {
          message: patch.error.message,
        });
      }
      const updated = await updateAnnotation(
        name,
        id.data,
        patch.data,
        mockupsDir,
      );
      if (!updated) throw notFound("annotation");
      return updated;
    }
  }
  return MockupAnnotationController;
}

/** Ends every open event stream; a browser's EventSource reconnects later. */
export function closeMockupStreams(engine: MockupEngine): void {
  const streams = [...engine.streams];
  engine.streams.clear();
  for (const stream of streams) stream.end();
}
