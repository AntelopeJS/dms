import { isString } from "../../../../dms-core/app/utils/type-check";
import type { MockupSpecPage } from "./mockupSpec";

/** A sub-page drawn under its parent, and how deep below its top page it sits: 1 for a parent's own sub-page. */
export interface NestedPage<Page> {
  page: Page;
  depth: number;
}

/** A mockup's pages as a forest: the pages that are no page's sub-page, and the sub-pages under each page. */
export interface PageForest<Page> {
  /** The pages with no parent, in their order: a parent the spec lacks, or a loop of parents, counts as none. */
  roots: Page[];
  /** The sub-pages under the page `id`, each followed by its own, in their order. */
  descendants: (id: string) => NestedPage<Page>[];
}

/** How a forest reads a page: its id and its parent's. */
interface PageKeys<Page> {
  idOf: (page: Page) => string;
  parentOf: (page: Page) => string | undefined;
}

/**
 * Nests `pages` under their parents, as the viewer lists a detail or form page
 * under the page it is opened from. A page whose parents lead back to it, or
 * to a page the spec lacks, stands on its own, so every page is listed once.
 */
export function pageForest<Page>(
  pages: readonly Page[],
  keys: PageKeys<Page>,
): PageForest<Page> {
  const ids = new Set(pages.map(keys.idOf));
  const parentOf = new Map(
    pages.map((page) => [keys.idOf(page), keys.parentOf(page)]),
  );
  const isNested = (page: Page): boolean => {
    const seen = new Set([keys.idOf(page)]);
    for (
      let at = keys.parentOf(page);
      at !== undefined;
      at = parentOf.get(at)
    ) {
      if (!ids.has(at) || seen.has(at)) return false;
      seen.add(at);
    }
    return keys.parentOf(page) !== undefined;
  };
  const nested = new Set(pages.filter(isNested).map(keys.idOf));
  const descendants = (id: string, depth = 1): NestedPage<Page>[] =>
    pages
      .filter(
        (page) => nested.has(keys.idOf(page)) && keys.parentOf(page) === id,
      )
      .flatMap((page) => [
        { page, depth },
        ...descendants(keys.idOf(page), depth + 1),
      ]);
  return {
    roots: pages.filter((page) => !nested.has(keys.idOf(page))),
    descendants: (id) => descendants(id),
  };
}

/** How a forest reads a page of the spec as written. */
export const SPEC_PAGE_KEYS: PageKeys<MockupSpecPage> = {
  idOf: (page) => page.id,
  parentOf: (page) => (isString(page.parent) ? page.parent : undefined),
};

/** Whether the sidebar leaves the spec page out. */
export function isHiddenPage(page: MockupSpecPage): boolean {
  return page.menu === false;
}

/**
 * Where a move among the top pages a section lists puts the page among all
 * the section's pages, which `movePageTo` counts: before the same top page,
 * so each sub-page keeps its place after its parent. `others` are the
 * section's pages without the moved one, `roots` the top ones among them.
 */
export function topMoveIndex<Page>(
  others: readonly Page[],
  roots: readonly Page[],
  index: number,
): number {
  const before = roots[index];
  return before === undefined ? others.length : others.indexOf(before);
}
