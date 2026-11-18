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
} from "./history";
import type {
  Json,
  JsonObject,
  MockupName,
  MockupPageState,
  MockupState,
} from "./model";
import { fixtureKeySchema, pageIdSchema, parseMockupName } from "./model";
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
 * `seq` instead of from the mockup as it is now. The URLs are the only place
 * the prefix appears, and it holds no character JSON escapes.
 */
function readingVersion(
  pages: MockupPageState[],
  name: MockupName,
  seq: number,
): MockupPageState[] {
  const live = `${MOCKUP_API}/${name}/pages/`;
  const own = `${MOCKUP_API}/${name}/history/${seq}/pages/`;
  // SAFETY: the pages are plain JSON, and replacing text inside their strings keeps every key and shape.
  return JSON.parse(
    JSON.stringify(pages).replaceAll(live, own),
  ) as MockupPageState[];
}

/** The mockup a version was recorded for, compiled as the viewer draws it. */
function stateOf(name: MockupName, version: MockupVersion): MockupState {
  const read = parseSpec(JSON.stringify(version.spec));
  if (!read.ok) return { name, revision: 0, pages: [], issues: read.issues };
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
  return state;
}

/**
 * The routes of a mockup's version history: the versions listed without their
 * specs, one version with the spec and how it draws, the fixtures that
 * version's blocks read, and a restore. Development only, and platform
 * owners only, like the rest of the mockup API.
 */
export function registerHistoryRoutes(mockupsDir: string) {
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
    const { name, version } = await versionOf(rawName, rawSeq);
    const page = checkParam(pageIdSchema, rawPage, "page");
    const key = checkParam(fixtureKeySchema, rawKey, "fixture");
    const read = parseSpec(JSON.stringify(version.spec));
    const fixtures = read.ok
      ? compileSpec(name, read.spec).fixtures.get(page)
      : undefined;
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
      const { name, version } = await versionOf(rawName, rawSeq);
      const { seq, at, by, summary, spec } = version;
      return {
        seq,
        at,
        by,
        summary,
        spec,
        state: stateOf(name, version),
        annotations:
          (await listVersionAnnotations(name, seq, spec, mockupsDir)) ?? [],
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
