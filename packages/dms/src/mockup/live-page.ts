import { resolve } from "node:path";
import {
  GetPageStructure,
  GetResourceStructure,
  ListPages,
  type OpResult,
  type PageStructure,
  type PageSummary,
  type ResourceStructure,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { openOracle } from "./compile";
import {
  collectControllers,
  convertPage,
  type SketchNote,
  slugOf,
} from "./from-page";
import type {
  JsonObject,
  MockupIssue,
  MockupName,
  MockupSpec,
  MockupSpecPage,
} from "./model";
import { parseMockupName, specSchema } from "./model";
import { readSpecSource, type SpecDigest, withSpecLock } from "./source";

export interface LivePages {
  listPages(): Promise<readonly PageSummary[]>;
  pageStructure(ref: string): Promise<OpResult<PageStructure>>;
  resourceStructure(ref: string): Promise<OpResult<ResourceStructure>>;
}

const BUILDER_PAGES: LivePages = {
  listPages: () => ListPages(),
  pageStructure: (ref) => GetPageStructure(ref),
  resourceStructure: (ref) => GetResourceStructure(ref),
};

export type LivePageTarget = { pageRef: string } | { path: string };

export interface EditAsMockupOptions {
  /** Convert again over the page's existing mockup instead of opening it. */
  replace?: boolean;
  /** Refuses a replace when the mockup's `spec.json` changed since this digest was read. */
  digest?: SpecDigest;
}

type Opened = { mockup: MockupName; page: string; url: string };

export type EditAsMockupAnswer =
  | ({
      ok: true;
      outcome: "created" | "replaced";
      sketches: SketchNote[];
      /** The fixture keys Real data reads from a live route. */
      liveRoutes: string[];
    } & Opened)
  | ({
      ok: true;
      outcome: "reopened";
      /** Whether the live page changed since it was converted. */
      stale: boolean;
      /** The digest of `spec.json` now: a replace must send it back. */
      digest: SpecDigest;
    } & Opened)
  | {
      ok: false;
      error: "not_found" | "unreadable" | "conflict" | "invalid";
      message: string;
      /** The issues that refused the converted spec, each at its JSON pointer. */
      errors: Pick<MockupIssue, "path" | "message">[];
    };

type Failure = Extract<EditAsMockupAnswer, { ok: false }>;

type LinkedSlot = {
  kind: "linked";
  name: MockupName;
  /** The id and version the page records, read from `spec.json` as written. */
  page: { id: string; version: string };
  /** Undefined when `spec.json` no longer passes the schema. */
  spec: MockupSpec | undefined;
  /** The page's place in `pages`, in the file and in `spec` alike. */
  index: number;
  digest: SpecDigest;
};

type Slot = { kind: "free"; name: MockupName } | LinkedSlot;

const MAX_SUFFIX = 99;

const specPagesSchema = z.object({ pages: z.array(z.unknown()) });
const linkedPageSchema = z.object({
  id: z.string(),
  livePage: z.object({ ref: z.string(), version: z.string() }),
});

function failure(
  error: Failure["error"],
  message: string,
  errors: Failure["errors"] = [],
): Failure {
  return { ok: false, error, message, errors };
}

function trimmedPath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

function answers(ref: string, segments: readonly string[]): boolean {
  const pattern = trimmedPath(ref).split("/");
  return (
    pattern.length === segments.length &&
    pattern.every(
      (part, index) =>
        part === segments[index] ||
        (part.startsWith(":") && segments[index] !== ""),
    )
  );
}

/**
 * The ref of the page a dashboard path shows: the page whose ref is the
 * path, else the first whose `:param` segments match it.
 */
export function resolvePageRef(
  path: string,
  pages: readonly Pick<PageSummary, "ref">[],
): string | undefined {
  const wanted = trimmedPath(path);
  const exact = pages.find((page) => trimmedPath(page.ref) === wanted);
  if (exact) return exact.ref;
  const segments = wanted.split("/");
  return pages.find(
    (page) => page.ref.includes(":") && answers(page.ref, segments),
  )?.ref;
}

function mockupUrl(name: MockupName, page: string): string {
  const query = new URLSearchParams({ name, page, mode: "edit" });
  return `/mockup?${query.toString()}`;
}

/**
 * The page of `spec` converted from `ref`, read loosely: a hand edit that
 * breaks the schema elsewhere in the file does not unlink it.
 */
function linkedPageOf(
  spec: JsonObject | undefined,
  ref: string,
): { index: number; id: string; version: string } | undefined {
  const read = specPagesSchema.safeParse(spec);
  if (!read.success) return undefined;
  for (const [index, entry] of read.data.pages.entries()) {
    const page = linkedPageSchema.safeParse(entry);
    if (page.success && page.data.livePage.ref === ref) {
      return { index, id: page.data.id, version: page.data.livePage.version };
    }
  }
  return undefined;
}

/**
 * The mockup of `ref`: under its slug, or the first `-2`, `-3`... that is
 * free or already holds a page converted from `ref`, valid or not. A mockup
 * made by hand, or from another page, is never taken.
 */
async function slotFor(mockupsDir: string, ref: string): Promise<Slot> {
  const base = slugOf(ref);
  for (let suffix = 1; suffix <= MAX_SUFFIX; suffix += 1) {
    const name = parseMockupName(suffix === 1 ? base : `${base}-${suffix}`);
    if (!name) continue;
    const source = await readSpecSource(mockupsDir, name);
    if (!source) return { kind: "free", name };
    const linked = linkedPageOf(source.spec, ref);
    if (linked) {
      const spec = specSchema.safeParse(source.spec);
      return {
        kind: "linked",
        name,
        page: { id: linked.id, version: linked.version },
        spec: spec.success ? spec.data : undefined,
        index: linked.index,
        digest: source.digest,
      };
    }
  }
  throw new Error(`no mockup name is left for the page ${ref}`);
}

async function readResources(
  refs: readonly string[],
  pages: LivePages,
): Promise<Map<string, ResourceStructure>> {
  const reads = await Promise.all(
    refs.map(async (ref) => [ref, await pages.resourceStructure(ref)] as const),
  );
  return new Map(
    reads.flatMap(([ref, read]) => (read.ok ? [[ref, read.data]] : [])),
  );
}

/** The spec a replace converts over, and the place of the page in it. */
type Replaced = { spec: MockupSpec; index: number };

/** Whether a replace may write over the linked mockup, or why it may not. */
function replaceable(
  slot: LinkedSlot,
  digest: SpecDigest | undefined,
): Replaced | Failure {
  if (!slot.spec) {
    return failure(
      "invalid",
      "spec.json has issues: fix them before converting the page again",
    );
  }
  if (digest !== undefined && digest !== slot.digest) {
    return failure("conflict", "spec.json changed since it was read");
  }
  return { spec: slot.spec, index: slot.index };
}

function specWith(
  replaced: Replaced | undefined,
  structure: PageStructure,
  page: MockupSpecPage,
): MockupSpec {
  if (!replaced) {
    return { version: 1, title: structure.page.displayName, pages: [page] };
  }
  const pages = replaced.spec.pages.map((existing, index) =>
    index === replaced.index ? page : existing,
  );
  return { ...replaced.spec, pages };
}

async function readStructure(
  target: LivePageTarget,
  pages: LivePages,
): Promise<PageStructure | Failure> {
  const ref =
    "pageRef" in target
      ? target.pageRef
      : resolvePageRef(target.path, await pages.listPages());
  if (ref === undefined) {
    return failure(
      "not_found",
      `no page of the project answers ${"path" in target ? target.path : ""}`,
    );
  }
  const read = await pages.pageStructure(ref);
  if (read.ok) return read.data;
  return read.error.code === "not_found"
    ? failure("not_found", `the builder has no page ${ref}`)
    : failure(
        "unreadable",
        `the builder cannot read the page ${ref}: ${read.error.code}`,
      );
}

const queues = new Map<string, Promise<void>>();

/**
 * Runs `task` after every task already queued under `key`, whether those
 * succeeded or failed: one failure never holds the queue.
 */
async function queued<Result>(
  key: string,
  task: () => Promise<Result>,
): Promise<Result> {
  const run = (queues.get(key) ?? Promise.resolve()).then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  queues.set(key, tail);
  try {
    return await run;
  } finally {
    if (queues.get(key) === tail) queues.delete(key);
  }
}

/**
 * Converts a live page into a mockup page and writes it, or opens the mockup
 * it already has. The same page always reaches the same mockup: a second
 * call writes nothing and says whether the page changed since, unless it
 * asks to `replace` it, which converts again over that page alone. Calls on
 * one mockups directory run one after the other, so two pages whose names
 * slug alike never pick the same free name.
 */
export function editPageAsMockup(
  mockupsDir: string,
  target: LivePageTarget,
  options: EditAsMockupOptions = {},
  pages: LivePages = BUILDER_PAGES,
): Promise<EditAsMockupAnswer> {
  return queued(resolve(mockupsDir), () =>
    convertLivePage(mockupsDir, target, options, pages),
  );
}

async function convertLivePage(
  mockupsDir: string,
  target: LivePageTarget,
  options: EditAsMockupOptions,
  pages: LivePages,
): Promise<EditAsMockupAnswer> {
  const structure = await readStructure(target, pages);
  if ("ok" in structure) return structure;
  const slot = await slotFor(mockupsDir, structure.page.ref);
  const pageId = slot.kind === "linked" ? slot.page.id : slot.name;
  const opened = {
    mockup: slot.name,
    page: pageId,
    url: mockupUrl(slot.name, pageId),
  };
  if (slot.kind === "linked" && !options.replace) {
    return {
      ok: true,
      outcome: "reopened",
      stale: slot.page.version !== structure.version,
      digest: slot.digest,
      ...opened,
    };
  }
  const replaced =
    slot.kind === "linked" ? replaceable(slot, options.digest) : undefined;
  if (replaced && "ok" in replaced) return replaced;
  const resources = await readResources(
    collectControllers(structure.blocks),
    pages,
  );
  const converted = convertPage(structure, pageId, {
    oracle: openOracle(slot.name, pageId),
    resources,
  });
  const spec = specWith(replaced, structure, converted.page);
  const read = slot.kind === "linked" ? slot.digest : undefined;
  const written = await withSpecLock(mockupsDir, slot.name, async (write) => {
    const current = await readSpecSource(mockupsDir, slot.name);
    return current?.digest === read ? write(spec) : undefined;
  });
  if (!written) {
    return failure("conflict", "spec.json changed since it was read");
  }
  if (!written.ok) {
    return failure("invalid", "the converted spec has issues", written.errors);
  }
  return {
    ok: true,
    outcome: slot.kind === "linked" ? "replaced" : "created",
    sketches: converted.sketches,
    liveRoutes: Object.keys(converted.page.liveRoutes ?? {}),
    ...opened,
  };
}
