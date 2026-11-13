import {
  GetPageStructure,
  GetResourceStructure,
  ListPages,
  type OpResult,
  type PageStructure,
  type PageSummary,
  type ResourceStructure,
} from "@antelopejs/interface-dms-builder";
import { openOracle } from "./compile";
import {
  collectControllers,
  convertPage,
  type SketchNote,
  slugOf,
} from "./from-page";
import type {
  MockupIssue,
  MockupName,
  MockupSpec,
  MockupSpecPage,
} from "./model";
import { parseMockupName, specSchema } from "./model";
import { readSpecSource, type SpecDigest, writeSpec } from "./source";

/** What a conversion reads of the project, through the builder. */
export interface LivePages {
  listPages(): Promise<readonly PageSummary[]>;
  pageStructure(ref: string): Promise<OpResult<PageStructure>>;
  resourceStructure(ref: string): Promise<OpResult<ResourceStructure>>;
}

/** The project's pages as the running builder reads them. */
const BUILDER_PAGES: LivePages = {
  listPages: () => ListPages(),
  pageStructure: (ref) => GetPageStructure(ref),
  resourceStructure: (ref) => GetResourceStructure(ref),
};

/** The live page to convert: by its builder ref, or by a dashboard path it answers. */
export type LivePageTarget = { pageRef: string } | { path: string };

/** How a second conversion of the same page behaves. */
export interface EditAsMockupOptions {
  /** Convert again over the page's existing mockup instead of opening it. */
  replace?: boolean;
  /** Refuses a replace when the mockup's `spec.json` changed since this digest was read. */
  digest?: SpecDigest;
}

/** Where a converted page opens, and what is drawn on it. */
type Opened = { mockup: MockupName; page: string; url: string };

/** What converting a live page into a mockup answers. */
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

/** The mockup the live page `ref` converts into: a name free for it, or the one it already has. */
type Slot =
  | { kind: "free"; name: MockupName }
  | {
      kind: "linked";
      name: MockupName;
      spec: MockupSpec;
      index: number;
      digest: SpecDigest;
    };

const MAX_SUFFIX = 99;

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

/** Whether a ref with `:param` segments answers the path split in `segments`. */
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
 * The mockup of `ref`: under its slug, or the first `-2`, `-3`... that is
 * free or already holds a page converted from `ref`. A mockup made by hand,
 * or from another page, is never taken.
 */
async function slotFor(mockupsDir: string, ref: string): Promise<Slot> {
  const base = slugOf(ref);
  for (let suffix = 1; suffix <= MAX_SUFFIX; suffix += 1) {
    const name = parseMockupName(suffix === 1 ? base : `${base}-${suffix}`);
    if (!name) continue;
    const source = await readSpecSource(mockupsDir, name);
    if (!source) return { kind: "free", name };
    const spec = specSchema.safeParse(source.spec);
    const index = spec.success
      ? spec.data.pages.findIndex((page) => page.livePage?.ref === ref)
      : -1;
    if (spec.success && index !== -1) {
      return {
        kind: "linked",
        name,
        spec: spec.data,
        index,
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

function specWith(
  slot: Slot,
  structure: PageStructure,
  page: MockupSpecPage,
): MockupSpec {
  if (slot.kind === "free") {
    return { version: 1, title: structure.page.displayName, pages: [page] };
  }
  const pages = slot.spec.pages.map((existing, index) =>
    index === slot.index ? page : existing,
  );
  return { ...slot.spec, pages };
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

/**
 * Converts a live page into a mockup page and writes it, or opens the mockup
 * it already has. The same page always reaches the same mockup: a second
 * call writes nothing and says whether the page changed since, unless it
 * asks to `replace` it, which converts again over that page alone.
 */
export async function editPageAsMockup(
  mockupsDir: string,
  target: LivePageTarget,
  options: EditAsMockupOptions = {},
  pages: LivePages = BUILDER_PAGES,
): Promise<EditAsMockupAnswer> {
  const structure = await readStructure(target, pages);
  if ("ok" in structure) return structure;
  const slot = await slotFor(mockupsDir, structure.page.ref);
  const pageId =
    slot.kind === "linked" ? slot.spec.pages[slot.index].id : slot.name;
  const opened = {
    mockup: slot.name,
    page: pageId,
    url: mockupUrl(slot.name, pageId),
  };
  if (slot.kind === "linked" && !options.replace) {
    const stale =
      slot.spec.pages[slot.index].livePage?.version !== structure.version;
    return {
      ok: true,
      outcome: "reopened",
      stale,
      digest: slot.digest,
      ...opened,
    };
  }
  if (
    slot.kind === "linked" &&
    options.digest !== undefined &&
    options.digest !== slot.digest
  ) {
    return failure("conflict", "spec.json changed since it was read");
  }
  const resources = await readResources(
    collectControllers(structure.blocks),
    pages,
  );
  const converted = convertPage(structure, pageId, {
    oracle: openOracle(slot.name, pageId),
    resources,
  });
  const spec = specWith(slot, structure, converted.page);
  const written = await writeSpec(mockupsDir, slot.name, spec);
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
