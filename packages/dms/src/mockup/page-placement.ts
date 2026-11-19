import type {
  CategorySummary,
  PageSummary,
} from "@antelopejs/interface-dms-builder";
import type { MockupCategory, MockupSpec, MockupSpecPage } from "./model";

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

/**
 * The refs of the app's pages in the sidebar's depth-first order: each
 * category's pages and subcategories as siblings, a subcategory's pages in
 * its place. A page whose category the menu does not hold comes last.
 */
export function menuOrder(
  pages: readonly PageSummary[],
  categories: readonly CategorySummary[],
): string[] {
  const children = new Map<string, (MenuEntry & { page?: PageSummary })[]>();
  const add = (parent: string, entry: MenuEntry & { page?: PageSummary }) =>
    children.set(parent, [...(children.get(parent) ?? []), entry]);
  for (const category of categories) add(category.parent ?? "", category);
  for (const page of pages) add(page.category, { ...page, page });
  const seen = new Set<string>();
  const walked = new Set<string>();
  const walk = (parent: string): string[] => {
    if (walked.has(parent)) return [];
    walked.add(parent);
    return (children.get(parent) ?? [])
      .toSorted(byMenuOrder)
      .flatMap((entry) => {
        if (!entry.page) return walk(entry.ref);
        seen.add(entry.page.ref);
        return [entry.page.ref];
      });
  };
  const ordered = walk("");
  const rest = pages
    .filter((page) => !seen.has(page.ref))
    .toSorted(byMenuOrder)
    .map((page) => page.ref);
  return [...ordered, ...rest];
}

function titleKey(title: string): string {
  return title.replace(/\s+/gu, "").toLocaleLowerCase();
}

/**
 * The spec's categories with `category` among them, and the id the page
 * files under: the category of the same id, else of the same title, case and
 * spaces aside, else `category` itself, added last.
 */
export function withCategory(
  spec: MockupSpec,
  category: MockupCategory,
): { categories: MockupCategory[]; id: string } {
  const categories = spec.categories ?? [];
  const known =
    categories.find(({ id }) => id === category.id) ??
    categories.find(
      ({ title }) => titleKey(title) === titleKey(category.title),
    );
  return known
    ? { categories, id: known.id }
    : { categories: [...categories, category], id: category.id };
}

/**
 * `spec` with `page`, converted from a live page, added at its real place:
 * under `category`, the mockup category of its sidebar section (none for
 * the default Pages section), and among that section's pages before the
 * first one converted from a live page the sidebar lists after it, in the
 * app's `order` of page refs. Without such a page it comes last in its
 * section, and last in the spec when its section holds no page yet.
 */
export function placePage(
  spec: MockupSpec,
  page: MockupSpecPage,
  category: MockupCategory | undefined,
  order: readonly string[],
): MockupSpec {
  const filed = category && withCategory(spec, category);
  const placed: MockupSpecPage = filed ? { ...page, category: filed.id } : page;
  const rank = (candidate: MockupSpecPage): number =>
    candidate.livePage ? order.indexOf(candidate.livePage.ref) : -1;
  const own = rank(placed);
  const siblings = spec.pages.flatMap((candidate, index) =>
    candidate.category === placed.category ? [{ candidate, index }] : [],
  );
  const after =
    own === -1
      ? undefined
      : siblings.find(({ candidate }) => rank(candidate) > own);
  const last = siblings.at(-1);
  const at = after?.index ?? (last ? last.index + 1 : spec.pages.length);
  return {
    ...spec,
    ...(filed && { categories: filed.categories }),
    pages: spec.pages.toSpliced(at, 0, placed),
  };
}
