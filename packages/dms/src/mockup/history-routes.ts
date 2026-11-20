import {
  Context,
  Controller,
  Get,
  HTTPResult,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { z } from "zod";
import {
  countAnnotationsByVersion,
  listVersionAnnotations,
  type MockupAnnotation,
} from "./annotations";
import { compileSpec, parseSpec } from "./compile";
import {
  listRows,
  MOCKUP_API,
  parseRows,
  parseRowsQuery,
  type RowsPage,
} from "./fixtures";
import {
  listVersions,
  type MockupVersion,
  type MockupVersionSummary,
  readVersion,
  versionStamp,
} from "./history";
import type {
  Json,
  JsonObject,
  MockupName,
  MockupNode,
  MockupPageState,
  MockupState,
} from "./model";
import {
  fixtureKeySchema,
  jsonObjectSchema,
  pageIdSchema,
  parseMockupName,
} from "./model";
import { MockupOwnerController } from "./owner-controller";
import { readSpecText, type SpecWriteResult, withSpecLock } from "./source";

const HTTP_NOT_FOUND = 404;
const SEQ_PATTERN = /^[1-9]\d{0,8}$/;

/** A version as the list answers it: with how many notes were pinned on it, resolved ones included. */
export interface MockupVersionListEntry extends MockupVersionSummary {
  comments: number;
}

/** What `GET /api/mockup/:name/history` answers. */
export interface MockupVersionList {
  versions: MockupVersionListEntry[];
}

/** What `GET /api/mockup/:name/history/:seq` answers: the version, and how it draws. */
export interface MockupVersionAnswer extends MockupVersionSummary {
  spec: JsonObject;
  /**
   * The spec compiled as the viewer draws it. Its fixture URLs read this
   * version's fixtures, not the ones the mockup has now.
   */
  state: MockupState;
  /**
   * The notes pinned on this version, resolved ones included, each placed
   * where its block or page is in this version's spec.
   */
  annotations: MockupAnnotation[];
}

function notFound(what: string): HTTPResult {
  return new HTTPResult(HTTP_NOT_FOUND, { message: `${what} not found` });
}

function nameOf(raw: string): MockupName {
  const name = parseMockupName(raw);
  if (!name) throw notFound("mockup");
  return name;
}

function seqOf(raw: string): number {
  if (!SEQ_PATTERN.test(raw)) throw notFound("version");
  return Number(raw);
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

/**
 * The pages of a compiled spec with every fixture URL read from the version
 * `seq` instead of from the mockup as it is now. The URLs sit in the options
 * of the nodes of `tree` and `realTree`, the only place the prefix appears.
 */
function readingVersion(
  pages: MockupPageState[],
  name: MockupName,
  seq: number,
): MockupPageState[] {
  const live = `${MOCKUP_API}/${name}/pages/`;
  const own = `${MOCKUP_API}/${name}/history/${seq}/pages/`;
  const value = (entry: Json): Json => {
    if (Array.isArray(entry)) return entry.map(value);
    const object = jsonObjectSchema.safeParse(entry);
    if (object.success) return fields(object.data);
    const text = z.string().safeParse(entry);
    return text.success ? text.data.replaceAll(live, own) : entry;
  };
  const fields = (object: JsonObject): JsonObject =>
    Object.fromEntries(
      Object.entries(object).map(([key, entry]) => [key, value(entry)]),
    );
  const node = (entry: MockupNode): MockupNode => ({
    ...entry,
    ...(entry.options && { options: fields(entry.options) }),
    ...(entry.children && { children: entry.children.map(node) }),
  });
  return pages.map((page) => ({
    ...page,
    tree: page.tree.map(node),
    ...(page.realTree && { realTree: page.realTree.map(node) }),
  }));
}

/** How many compiled versions the routes keep, the least recently read dropped first. */
const COMPILED_VERSIONS = 8;

/** A version, compiled once for its answer and for every fixture its blocks read. */
interface CompiledVersion {
  version: MockupVersion;
  /** The mockup the version was recorded for, as the viewer draws it. */
  state: MockupState;
  /** Each page's fixtures, keyed by page id. */
  fixtures: Map<string, JsonObject>;
}

/** A compiled version, and the stamp of the file it was compiled from. */
interface CachedVersion {
  stamp: string;
  compiled: Promise<CompiledVersion | undefined>;
}

function compileVersion(
  name: MockupName,
  version: MockupVersion,
): CompiledVersion {
  const read = parseSpec(JSON.stringify(version.spec));
  if (!read.ok) {
    return {
      version,
      state: { name, revision: 0, pages: [], issues: read.issues },
      fixtures: new Map(),
    };
  }
  const compiled = compileSpec(name, read.spec);
  const state: MockupState = {
    name,
    revision: 0,
    pages: readingVersion(compiled.pages, name, version.seq),
    issues: compiled.issues,
  };
  if (compiled.title !== undefined) state.title = compiled.title;
  if (compiled.categories !== undefined) {
    state.categories = compiled.categories;
  }
  if (compiled.sidebar !== undefined) state.sidebar = compiled.sidebar;
  if (compiled.modules !== undefined) state.modules = compiled.modules;
  return { version, state, fixtures: compiled.fixtures };
}

/**
 * Reads a version of a mockup compiled, compiling it once while its file
 * stays the same: a stored version does not change, but a write folded into
 * the newest one replaces its file, and a deleted mockup takes its files
 * along. It keeps the {@link COMPILED_VERSIONS} versions read last.
 */
function compiledVersions(mockupsDir: string) {
  const cache = new Map<string, CachedVersion>();

  async function readCompiled(
    name: MockupName,
    seq: number,
  ): Promise<CompiledVersion | undefined> {
    const version = await readVersion(mockupsDir, name, seq);
    return version && compileVersion(name, version);
  }

  async function compiledOf(
    rawName: string,
    rawSeq: string,
  ): Promise<CompiledVersion> {
    const name = nameOf(rawName);
    const seq = seqOf(rawSeq);
    const key = `${name}/${seq}`;
    const stamp = await versionStamp(mockupsDir, name, seq);
    const cached = cache.get(key);
    cache.delete(key);
    if (stamp === undefined) throw notFound("version");
    const entry =
      cached?.stamp === stamp
        ? cached
        : { stamp, compiled: readCompiled(name, seq) };
    cache.set(key, entry);
    for (const old of [...cache.keys()].slice(0, -COMPILED_VERSIONS)) {
      cache.delete(old);
    }
    const compiled = await entry.compiled.catch((error: unknown) => {
      if (cache.get(key) === entry) cache.delete(key);
      throw error;
    });
    if (!compiled) throw notFound("version");
    return compiled;
  }
  return compiledOf;
}

/**
 * The routes of a mockup's version history: the versions listed without their
 * specs, one version with the spec and how it draws, the fixtures that
 * version's blocks read, and a restore. Development only, and platform
 * owners only, like the rest of the mockup API.
 */
export function registerHistoryRoutes(mockupsDir: string) {
  const compiledOf = compiledVersions(mockupsDir);

  async function versionOf(rawName: string, rawSeq: string) {
    const name = nameOf(rawName);
    const version = await readVersion(mockupsDir, name, seqOf(rawSeq));
    if (!version) throw notFound("version");
    return { name, version };
  }

  async function fixtureOf(
    rawName: string,
    rawSeq: string,
    rawPage: string,
    rawKey: string,
  ): Promise<Json> {
    const compiled = await compiledOf(rawName, rawSeq);
    const page = checkParam(pageIdSchema, rawPage, "page");
    const key = checkParam(fixtureKeySchema, rawKey, "fixture");
    const fixtures = compiled.fixtures.get(page);
    if (!fixtures || !Object.hasOwn(fixtures, key)) throw notFound("fixture");
    return fixtures[key];
  }

  class MockupHistoryController extends Controller(
    MOCKUP_API,
    MockupOwnerController,
  ) {
    @Get(":name/history")
    async versions(
      @Parameter("name") rawName: string,
    ): Promise<MockupVersionList> {
      await this.assertOwner();
      const name = nameOf(rawName);
      if ((await readSpecText(mockupsDir, name)) === undefined) {
        throw notFound("mockup");
      }
      const counts = await countAnnotationsByVersion(name, mockupsDir);
      const versions = await listVersions(mockupsDir, name);
      return {
        versions: versions.map((entry) => ({
          ...entry,
          comments: counts.get(entry.seq) ?? 0,
        })),
      };
    }

    @Get(":name/history/:seq")
    async version(
      @Parameter("name") rawName: string,
      @Parameter("seq") rawSeq: string,
    ): Promise<MockupVersionAnswer> {
      await this.assertOwner();
      const { version, state } = await compiledOf(rawName, rawSeq);
      const { seq, at, by, summary, spec } = version;
      return {
        seq,
        at,
        by,
        summary,
        spec,
        state,
        annotations:
          (await listVersionAnnotations(state.name, seq, spec, mockupsDir)) ??
          [],
      };
    }

    @Post(":name/history/:seq/restore")
    async restore(
      @Parameter("name") rawName: string,
      @Parameter("seq") rawSeq: string,
    ): Promise<SpecWriteResult> {
      await this.assertOwner();
      const { name, version } = await versionOf(rawName, rawSeq);
      return withSpecLock(mockupsDir, name, async (write) => {
        if ((await readSpecText(mockupsDir, name)) === undefined) {
          throw notFound("mockup");
        }
        return write(version.spec, {
          by: "you",
          summary: `Restored version ${version.seq}`,
          sealed: true,
        });
      });
    }

    @Get(":name/history/:seq/pages/:page/fixtures/:key")
    async fixture(
      @Parameter("name") rawName: string,
      @Parameter("seq") rawSeq: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
    ): Promise<Json> {
      await this.assertOwner();
      return fixtureOf(rawName, rawSeq, rawPage, rawKey);
    }

    @Get(":name/history/:seq/pages/:page/fixtures/:key/rows")
    async rows(
      @Parameter("name") rawName: string,
      @Parameter("seq") rawSeq: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
      @Context() context: RequestContext,
    ): Promise<RowsPage> {
      await this.assertOwner();
      const rows = parseRows(await fixtureOf(rawName, rawSeq, rawPage, rawKey));
      if (!rows) throw notFound("array of rows");
      return listRows(rows, parseRowsQuery(context.url.searchParams));
    }

    /** The rows where a data controller's list route stands, which a kanban board reads. */
    @Get(":name/history/:seq/pages/:page/fixtures/:key/rows/list")
    async rowsList(
      @Parameter("name") rawName: string,
      @Parameter("seq") rawSeq: string,
      @Parameter("page") rawPage: string,
      @Parameter("key") rawKey: string,
      @Context() context: RequestContext,
    ): Promise<RowsPage> {
      return this.rows(rawName, rawSeq, rawPage, rawKey, context);
    }
  }
  return MockupHistoryController;
}
