import { resolve } from "node:path";
import type {
  CategorySummary,
  PageSummary,
} from "@antelopejs/interface-dms-builder";
import { openOracle } from "./compile";
import {
  collectControllers,
  convertPage,
  type SketchNote,
  slugOf,
} from "./from-page";
import { BUILDER_PAGES, type LivePages, readResources } from "./live-page";
import type {
  MockupCategory,
  MockupIssue,
  MockupName,
  MockupSpec,
  MockupSpecPage,
} from "./model";
import { MAX_PAGES } from "./model";
import { queued } from "./queue";
import { readSpecSource, withSpecLock } from "./source";

/** What the conversion of an app answers. */
export type FromAppAnswer =
  | {
      ok: true;
      outcome: "created";
      mockup: MockupName;
      url: string;
      /** The ids of the live reference pages, in the spec's order. */
      live: string[];
      /** The ids of the converted pages, in the spec's order. */
      converted: string[];
      sketches: SketchNote[];
      /** The fixture keys Real data reads from a live route, by converted page id. */
      liveRoutes: Record<string, string[]>;
    }
  | {
      ok: false;
      error: "not_found" | "unreadable" | "conflict" | "invalid";
      message: string;
      errors: Pick<MockupIssue, "path" | "message">[];
    };

type Failure = Extract<FromAppAnswer, { ok: false }>;

/** The menu's default section, the built-in Pages: a mockup draws its pages under no category. */
const DEFAULT_SECTION = "pages";
/** The dashboard's own roots, which the app's menu does not list. */
const OWN_ROOTS = new Set(["modules", "settings"]);
const ROUTE_PARAM = ":";

function failure(
  error: Failure["error"],
  message: string,
  errors: Failure["errors"] = [],
): Failure {
  return { ok: false, error, message, errors };
}

function rootOf(ref: string): string {
  return ref.split(".", 1)[0] ?? ref;
}

/** A sidebar entry, a page or a category, as the menu sorts its siblings. */
interface MenuEntry {
  order?: number;
  displayName: string;
  ref: string;
}

/** The sidebar's order: lowest `order` first, a missing one as 0, then by title and ref. */
function byMenuOrder(a: MenuEntry, b: MenuEntry): number {
  return (
    (a.order ?? 0) - (b.order ?? 0) ||
    a.displayName.localeCompare(b.displayName) ||
    a.ref.localeCompare(b.ref)
  );
}

/** A spec id for `text` unused in `taken`, which it joins. */
function uniqueId(text: string, taken: Set<string>): string {
  const base = slugOf(text);
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}-${suffix}`;
  taken.add(id);
  return id;
}

/** The app's menu as a spec lays it out: its sections as categories, and its pages in menu order, each with its section's id. */
interface AppMenu {
  categories: MockupCategory[];
  pages: { summary: PageSummary; category?: string }[];
}

/**
 * `pages` in the sidebar's depth-first order: each category's pages and
 * subcategories as siblings, a subcategory's pages in its place. A page
 * whose category the menu does not hold comes last.
 */
function inMenuOrder(
  pages: readonly PageSummary[],
  categories: readonly CategorySummary[],
): PageSummary[] {
  const children = new Map<string, (MenuEntry & { page?: PageSummary })[]>();
  const add = (parent: string, entry: MenuEntry & { page?: PageSummary }) =>
    children.set(parent, [...(children.get(parent) ?? []), entry]);
  for (const category of categories) add(category.parent ?? "", category);
  for (const page of pages) add(page.category, { ...page, page });
  const seen = new Set<PageSummary>();
  const walked = new Set<string>();
  const walk = (parent: string): PageSummary[] => {
    if (walked.has(parent)) return [];
    walked.add(parent);
    return (children.get(parent) ?? [])
      .toSorted(byMenuOrder)
      .flatMap((entry) => {
        if (!entry.page) return walk(entry.ref);
        seen.add(entry.page);
        return [entry.page];
      });
  };
  const ordered = walk("");
  return [
    ...ordered,
    ...pages.filter((page) => !seen.has(page)).toSorted(byMenuOrder),
  ];
}

/**
 * The app's menu: the pages of the default section, then each sidebar
 * section's, sections and pages in the sidebar's order. Each section but
 * the default one becomes a spec category; a category folded under an
 * entry draws its pages in its section. A page whose route takes a
 * parameter is left out: it shows one row, which no menu entry names. So
 * are the dashboard's own pages, such as the settings.
 */
function appMenu(
  pages: readonly PageSummary[],
  categories: readonly CategorySummary[],
): AppMenu {
  const sections = categories
    .filter(
      (category) =>
        category.section === true &&
        category.ref !== DEFAULT_SECTION &&
        !OWN_ROOTS.has(rootOf(category.ref)),
    )
    .toSorted(byMenuOrder);
  const ids = new Set<string>();
  const sectionIds = new Map(
    sections.map((section) => [section.ref, uniqueId(section.ref, ids)]),
  );
  const shown = inMenuOrder(pages, categories).filter(
    (page) =>
      !page.ref.includes(ROUTE_PARAM) && !OWN_ROOTS.has(rootOf(page.category)),
  );
  const categoryOf = (page: PageSummary): string | undefined =>
    page.section === undefined ? undefined : sectionIds.get(page.section);
  return {
    categories: sections.map((section) => ({
      id: sectionIds.get(section.ref) ?? section.ref,
      title: section.displayName,
      ...(section.icon !== undefined && { icon: section.icon }),
    })),
    pages: [undefined, ...sectionIds.values()].flatMap((category) =>
      shown
        .filter((page) => categoryOf(page) === category)
        .map((summary) =>
          category === undefined ? { summary } : { summary, category },
        ),
    ),
  };
}

/** A page of the app that stays as it is: its menu entry, and the route it stands for. */
function liveRef(
  id: string,
  summary: PageSummary,
  category: string | undefined,
): MockupSpecPage {
  return {
    id,
    title: summary.displayName,
    ...(summary.icon !== undefined && { icon: summary.icon }),
    ...(category !== undefined && { category }),
    ...(summary.hidden === true && { menu: false }),
    live: { ref: summary.ref },
    tree: [],
  };
}

interface Converted {
  page: MockupSpecPage;
  sketches: SketchNote[];
}

async function convertAt(
  name: MockupName,
  id: string,
  summary: PageSummary,
  category: string | undefined,
  pages: LivePages,
): Promise<Converted | Failure> {
  const read = await pages.pageStructure(summary.ref);
  if (!read.ok) {
    return failure(
      "unreadable",
      `the builder cannot read the page ${summary.ref}: ${read.error.code}`,
    );
  }
  const structure = read.data;
  const resources = await readResources(
    collectControllers(structure.blocks),
    pages,
  );
  const converted = convertPage(structure, id, {
    oracle: openOracle(name, id),
    resources,
  });
  return {
    page: {
      ...converted.page,
      ...(category !== undefined && { category }),
      ...(summary.hidden === true && { menu: false }),
    },
    sketches: converted.sketches,
  };
}

function mockupUrl(name: MockupName, page: string | undefined): string {
  const query = new URLSearchParams({ name, ...(page && { page }) });
  return `/mockup?${query.toString()}`;
}

/**
 * Writes mockup `name` as the whole app: the sidebar's sections as its
 * categories, in their order, and every page of its menu in its place, each a live reference
 * page but those of `convert`, converted there as {@link convertPage} does.
 * A mockup that already exists is left as it is.
 */
export function editAppAsMockup(
  mockupsDir: string,
  name: MockupName,
  convert: readonly string[] = [],
  pages: LivePages = BUILDER_PAGES,
): Promise<FromAppAnswer> {
  return queued(resolve(mockupsDir), () =>
    convertApp(mockupsDir, name, convert, pages),
  );
}

async function convertApp(
  mockupsDir: string,
  name: MockupName,
  convert: readonly string[],
  pages: LivePages,
): Promise<FromAppAnswer> {
  if (await readSpecSource(mockupsDir, name)) {
    return failure(
      "conflict",
      `the mockup ${name} already exists: pick another name`,
    );
  }
  const menu = appMenu(await pages.listPages(), await pages.listCategories());
  const known = new Set(menu.pages.map(({ summary }) => summary.ref));
  const missing = convert.filter((ref) => !known.has(ref));
  if (missing.length) {
    return failure(
      "not_found",
      `the app's menu has no page ${missing.join(", ")}: name each by its ref, as builder_list_pages lists it`,
    );
  }
  if (menu.pages.length > MAX_PAGES) {
    return failure(
      "invalid",
      `the app's menu has ${menu.pages.length} pages; a mockup holds at most ${MAX_PAGES}`,
    );
  }
  const ids = new Set<string>();
  const specPages: MockupSpecPage[] = [];
  const sketches: SketchNote[] = [];
  const liveRoutes: Record<string, string[]> = {};
  for (const { summary, category } of menu.pages) {
    const id = uniqueId(summary.ref, ids);
    if (!convert.includes(summary.ref)) {
      specPages.push(liveRef(id, summary, category));
      continue;
    }
    const converted = await convertAt(name, id, summary, category, pages);
    if ("ok" in converted) return converted;
    specPages.push(converted.page);
    sketches.push(...converted.sketches);
    liveRoutes[id] = Object.keys(converted.page.liveRoutes ?? {});
  }
  const spec: MockupSpec = {
    version: 1,
    pages: specPages,
    ...(menu.categories.length > 0 && { categories: menu.categories }),
  };
  const written = await withSpecLock(mockupsDir, name, async (write) =>
    (await readSpecSource(mockupsDir, name))
      ? undefined
      : write(spec, { by: "you" }),
  );
  if (!written) {
    return failure(
      "conflict",
      `the mockup ${name} already exists: pick another name`,
    );
  }
  if (!written.ok) {
    return failure("invalid", "the converted spec has issues", written.errors);
  }
  const first = specPages.find((page) => page.live === undefined);
  return {
    ok: true,
    outcome: "created",
    mockup: name,
    url: mockupUrl(name, first?.id ?? specPages[0]?.id),
    live: specPages.flatMap((page) => (page.live ? [page.id] : [])),
    converted: specPages.flatMap((page) => (page.live ? [] : [page.id])),
    sketches,
    liveRoutes,
  };
}
