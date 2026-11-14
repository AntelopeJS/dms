import { resolve } from "node:path";
import {
  type BuilderError,
  type MutationOpts,
  type OpResult,
  type PageDraft,
  SetPageBlocks,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import type { NodeStamp } from "./apply-fate";
import type { WiringNote } from "./apply-notes";
import { type DraftSummary, planApply, summarize } from "./apply-plan";
import { openOracle } from "./compile";
import { collectControllers, convertPage } from "./from-page";
import { BUILDER_PAGES, type LivePages, readResources } from "./live-page";
import type {
  JsonObject,
  MockupIssue,
  MockupLivePage,
  MockupName,
  MockupSpecPage,
} from "./model";
import { specSchema, zodIssues } from "./model";
import { queued } from "./queue";
import {
  parseSpecObject,
  readSpecSource,
  readSpecText,
  specValueAt,
  withSpecLock,
} from "./source";

/** The builder, as an apply reads the live page and writes it. */
export interface LivePageWriter extends LivePages {
  setPageBlocks(
    ref: string,
    draft: PageDraft,
    opts: MutationOpts,
  ): Promise<OpResult<{ version: string }>>;
}

const BUILDER_WRITER: LivePageWriter = {
  ...BUILDER_PAGES,
  setPageBlocks: (ref, draft, opts) => SetPageBlocks(ref, draft, opts),
};

type Stamp = { stamped: true } | { stamped: false; message: string };

export type ApplyToPageAnswer =
  | ({
      ok: true;
      outcome: "applied";
      /** The live page and the version the write left it at. */
      livePage: MockupLivePage;
      wiring: WiringNote[];
    } & Stamp &
      DraftSummary)
  | {
      ok: false;
      error: "stale";
      message: string;
      /** The page and version the mockup was converted from. */
      livePage: MockupLivePage;
      currentVersion: string;
    }
  | {
      ok: false;
      error: "not_found" | "not_linked" | "invalid" | "unreadable";
      message: string;
      /** The issues that refused the spec or the draft, each at its pointer. */
      errors: Pick<MockupIssue, "path" | "message">[];
    };

type Failure = Extract<ApplyToPageAnswer, { error: string; errors: unknown }>;

type Linked = { page: MockupSpecPage; livePage: MockupLivePage; index: number };

function failure(
  error: Failure["error"],
  message: string,
  errors: Failure["errors"] = [],
): Failure {
  return { ok: false, error, message, errors };
}

function stale(
  livePage: MockupLivePage,
  currentVersion: string,
): ApplyToPageAnswer {
  return {
    ok: false,
    error: "stale",
    message: `the page ${livePage.ref} changed since it was converted: nothing was written`,
    livePage,
    currentVersion,
  };
}

async function readLinked(
  mockupsDir: string,
  name: MockupName,
  pageId: string,
): Promise<Linked | Failure> {
  const source = await readSpecSource(mockupsDir, name);
  if (!source) return failure("not_found", `there is no mockup ${name}`);
  const spec = specSchema.safeParse(source.spec);
  if (!spec.success) {
    return failure(
      "invalid",
      "spec.json breaks its schema: fix it before building it",
      zodIssues("", spec.error),
    );
  }
  const index = spec.data.pages.findIndex((page) => page.id === pageId);
  const page = spec.data.pages[index];
  if (!page) {
    return failure("not_found", `the mockup ${name} has no page ${pageId}`);
  }
  const { livePage } = page;
  if (!livePage) {
    return failure(
      "not_linked",
      `the page ${pageId} was not converted from a live page`,
    );
  }
  return { page, livePage, index };
}

function refused(
  error: BuilderError,
  livePage: MockupLivePage,
): ApplyToPageAnswer {
  switch (error.code) {
    case "stale":
      return stale(livePage, error.currentVersion);
    case "not_found":
      return failure("not_found", `the builder has no page ${livePage.ref}`);
    case "invalid_config":
      return failure(
        "invalid",
        "the builder refused the draft",
        error.issues.map(({ pointer, message }) => ({
          path: pointer,
          message,
        })),
      );
    case "typecheck_failed":
      return failure(
        "invalid",
        "the draft does not typecheck",
        error.diagnostics.map(({ file, line, message }) => ({
          path: `${file}:${line}`,
          message,
        })),
      );
    default:
      return failure(
        "invalid",
        `the builder refused the draft: ${JSON.stringify(error)}`,
      );
  }
}

const unnamedSchema = z.object({ id: z.undefined(), type: z.string() });

/** Whether the node a stamp names still has no id and the type it was written as. */
function stillUnnamed(spec: JsonObject, stamp: NodeStamp): boolean {
  const node = unnamedSchema.safeParse(specValueAt(spec, stamp.path));
  return node.success && node.data.type === stamp.type;
}

/**
 * Records the version the write left the page at in `livePage`, and the name
 * each node in `stamps` was written under as its id, unless the spec no
 * longer links page `index` to the page. A node that took an id or another
 * type meanwhile keeps it.
 */
function stampSpec(
  mockupsDir: string,
  name: MockupName,
  index: number,
  livePage: MockupLivePage,
  stamps: readonly NodeStamp[],
): Promise<Stamp> {
  return withSpecLock(mockupsDir, name, async (_write, _stamp, set) => {
    const text = await readSpecText(mockupsDir, name);
    const spec = text === undefined ? undefined : parseSpecObject(text);
    const page = `/pages/${index}/livePage`;
    if (
      text === undefined ||
      spec === undefined ||
      specValueAt(spec, `${page}/ref`) !== livePage.ref
    ) {
      return {
        stamped: false,
        message: `spec.json changed during the write: /pages/${index} no longer records ${livePage.ref}, so its livePage.version was left as it was`,
      };
    }
    const ids = stamps
      .filter((stamp) => stillUnnamed(spec, stamp))
      .map(({ path, id }) => ({ path, key: "id", value: id }));
    await set(text, [
      { path: page, key: "version", value: livePage.version },
      ...ids,
    ]);
    return { stamped: true };
  });
}

async function applyNow(
  mockupsDir: string,
  name: MockupName,
  pageId: string,
  pages: LivePageWriter,
): Promise<ApplyToPageAnswer> {
  const linked = await readLinked(mockupsDir, name, pageId);
  if ("ok" in linked) return linked;
  const { page, livePage, index } = linked;
  const read = await pages.pageStructure(livePage.ref);
  if (!read.ok) {
    return read.error.code === "not_found"
      ? failure("not_found", `the builder has no page ${livePage.ref}`)
      : failure(
          "unreadable",
          `the builder cannot read the page ${livePage.ref}: ${read.error.code}`,
        );
  }
  const structure = read.data;
  if (structure.version !== livePage.version) {
    return stale(livePage, structure.version);
  }
  const oracle = openOracle(name, page.id);
  const resources = await readResources(
    collectControllers(structure.blocks),
    pages,
  );
  const reconverted = convertPage(structure, page.id, { oracle, resources });
  const plan = planApply(page, structure, reconverted.page, {
    pointer: `/pages/${index}`,
    oracle,
  });
  const result = await pages.setPageBlocks(livePage.ref, plan.draft, {
    expectedVersion: livePage.version,
  });
  if (!result.ok) return refused(result.error, livePage);
  const written = { ref: livePage.ref, version: result.data.version };
  return {
    ok: true,
    outcome: "applied",
    livePage: written,
    ...(await stampSpec(mockupsDir, name, index, written, plan.stamps)),
    ...summarize(plan.draft, structure),
    wiring: plan.wiring,
  };
}

/**
 * Builds page `pageId` of a mockup, converted from a live page, back into
 * that page in one conditional write (see {@link planApply}), then records
 * the page's new version in the spec. It never creates a page: one the
 * builder no longer has answers `not_found`, and one that changed since the
 * conversion answers `stale` with nothing written. Calls on one mockups
 * directory run one after the other, and after any conversion queued before.
 */
export function applyMockupToPage(
  mockupsDir: string,
  name: MockupName,
  pageId: string,
  pages: LivePageWriter = BUILDER_WRITER,
): Promise<ApplyToPageAnswer> {
  return queued(resolve(mockupsDir), () =>
    applyNow(mockupsDir, name, pageId, pages),
  );
}
