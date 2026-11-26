import { isString } from "../../../../dms-core/app/utils/type-check";
import type { JsonObject } from "./json";
import { isMockupCategory, type MockupCategory } from "./mockup";
import {
  MOCKUP_MAX_PAGES,
  freeId,
  slugify,
  type MockupSpecDocument,
  type MockupSpecPage,
} from "./mockupSpec";

/** Its pages go to the default section. */
type RemoveCategoryEdit = { kind: "removeCategory"; category: string };

/** `to` is the category's index among the categories once it moved. */
type MoveCategoryEdit = { kind: "moveCategory"; category: string; to: number };

/** One change to the sidebar's sections, from the left panel or the preview's sidebar. */
export type MockupSectionEdit =
  | { kind: "addCategory"; title: string }
  | {
      kind: "updateCategory";
      category: string;
      title?: string;
      /** Empty removes it. */
      icon?: string;
    }
  | RemoveCategoryEdit
  | MoveCategoryEdit
  | {
      kind: "movePageTo";
      page: string;
      /** Null for the default section. */
      category: string | null;
      /** The page's index among its new section's pages, counted without it. */
      index: number;
    };

export type MockupSectionEditKind = MockupSectionEdit["kind"];

/** A section and the pages listed under it, in order. */
export interface MockupSection<Page> {
  /** The category it stands for; none for the default section. */
  category?: MockupCategory;
  pages: Page[];
}

const CATEGORY_ID_FALLBACK = "section";

/**
 * The sidebar's sections, as the categories of the dashboard's menu group its
 * pages: the default section, which holds the pages without a category, then
 * each category of the spec in the menu's order.
 *
 * The pages under their sections: the default section first, then each
 * category in order, each holding its pages in the order given. A page that
 * names no category given is in the default section.
 */
export function groupSections<Page>(
  categories: readonly MockupCategory[],
  pages: readonly Page[],
  categoryOf: (page: Page) => string | undefined,
): MockupSection<Page>[] {
  const known = new Set(categories.map((category) => category.id));
  const sectionOf = (page: Page) => {
    const id = categoryOf(page);
    return id !== undefined && known.has(id) ? id : undefined;
  };
  return [
    { pages: pages.filter((page) => sectionOf(page) === undefined) },
    ...categories.map((category) => ({
      category,
      pages: pages.filter((page) => sectionOf(page) === category.id),
    })),
  ];
}

/** The categories a spec holds, in order, as far as each reads cleanly. */
export function specCategories(spec: MockupSpecDocument): MockupCategory[] {
  const { categories } = spec;
  if (!Array.isArray(categories)) return [];
  return categories.flatMap((entry) =>
    isMockupCategory(entry) ? [entry] : [],
  );
}

/** The category a spec page names, if it names one. */
export function pageCategory(page: MockupSpecPage): string | undefined {
  const { category } = page;
  return isString(category) ? category : undefined;
}

/** The spec's pages under their sections. */
export function specSections(
  spec: MockupSpecDocument,
): MockupSection<MockupSpecPage>[] {
  return groupSections(specCategories(spec), spec.pages, pageCategory);
}

function categoryJson(category: MockupCategory): JsonObject {
  const written: JsonObject = { id: category.id, title: category.title };
  if (category.icon) written.icon = category.icon;
  return written;
}

/** The spec with `categories`, taken out of it when there are none. */
function withCategories(
  spec: MockupSpecDocument,
  categories: readonly MockupCategory[],
): MockupSpecDocument {
  const { categories: _previous, ...rest } = spec;
  return categories.length
    ? { ...rest, categories: categories.map(categoryJson) }
    : rest;
}

/** `page` listed under `category`, or under the default section for null. */
function withPageCategory(
  page: MockupSpecPage,
  category: string | null,
): MockupSpecPage {
  if (pageCategory(page) === (category ?? undefined)) return page;
  const { category: _previous, ...rest } = page;
  return category === null ? rest : { ...page, category };
}

/** The spec with `pages` in their place, or the very spec when no page moved. */
function withPages(
  spec: MockupSpecDocument,
  pages: MockupSpecPage[],
): MockupSpecDocument {
  const isSame =
    pages.length === spec.pages.length &&
    pages.every((page, index) => page === spec.pages[index]);
  return isSame ? spec : { ...spec, pages };
}

function moveTo<Item>(list: Item[], item: Item, index: number): Item[] {
  const rest = list.filter((entry) => entry !== item);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), item, ...rest.slice(at)];
}

function addCategory(
  spec: MockupSpecDocument,
  title: string,
): MockupSpecDocument {
  const categories = specCategories(spec);
  const name = title.trim();
  if (!name || categories.length >= MOCKUP_MAX_PAGES) return spec;
  const taken = new Set(categories.map((category) => category.id));
  const id = freeId(taken, slugify(name) || CATEGORY_ID_FALLBACK);
  return withCategories(spec, [...categories, { id, title: name }]);
}

function updateCategory(
  spec: MockupSpecDocument,
  edit: Extract<MockupSectionEdit, { kind: "updateCategory" }>,
): MockupSpecDocument {
  const categories = specCategories(spec);
  const index = categories.findIndex((entry) => entry.id === edit.category);
  const category = categories[index];
  if (!category) return spec;
  const title = edit.title?.trim() || category.title;
  const icon = edit.icon === undefined ? category.icon : edit.icon || undefined;
  if (title === category.title && icon === category.icon) return spec;
  const next = categories.map((entry, at) =>
    at === index ? { id: entry.id, title, icon } : entry,
  );
  return withCategories(spec, next);
}

function removeCategory(
  spec: MockupSpecDocument,
  id: string,
): MockupSpecDocument {
  const categories = specCategories(spec);
  if (!categories.some((category) => category.id === id)) return spec;
  const kept = categories.filter((category) => category.id !== id);
  const pages = groupSections(kept, spec.pages, pageCategory).flatMap(
    (section) =>
      section.pages.map((page) =>
        pageCategory(page) === id ? withPageCategory(page, null) : page,
      ),
  );
  return { ...withCategories(spec, kept), pages };
}

function moveCategory(
  spec: MockupSpecDocument,
  id: string,
  to: number,
): MockupSpecDocument {
  const categories = specCategories(spec);
  const category = categories.find((entry) => entry.id === id);
  if (!category) return spec;
  const moved = moveTo(categories, category, to);
  if (moved.every((entry, index) => entry === categories[index])) return spec;
  const pages = groupSections(moved, spec.pages, pageCategory).flatMap(
    (section) => section.pages,
  );
  return { ...withCategories(spec, moved), pages };
}

/**
 * The spec with the page moved into a section at `index`, its pages listed
 * section after section, so the first one listed is the spec's first page.
 */
function movePageTo(
  spec: MockupSpecDocument,
  edit: Extract<MockupSectionEdit, { kind: "movePageTo" }>,
): MockupSpecDocument {
  const page = spec.pages.find((entry) => entry.id === edit.page);
  const categories = specCategories(spec);
  const isKnown =
    edit.category === null ||
    categories.some((category) => category.id === edit.category);
  if (!page || !isKnown) return spec;
  const current = groupSections(categories, spec.pages, pageCategory).find(
    (section) => section.pages.includes(page),
  );
  const isInPlace =
    (current?.category?.id ?? null) === edit.category &&
    current?.pages.indexOf(page) === edit.index;
  if (isInPlace) return spec;
  const moved = withPageCategory(page, edit.category);
  const sections = groupSections(
    categories,
    spec.pages.filter((entry) => entry !== page),
    pageCategory,
  );
  const pages = sections.flatMap((section) =>
    (section.category?.id ?? null) === edit.category
      ? moveTo(section.pages, moved, edit.index)
      : section.pages,
  );
  return withPages(spec, pages);
}

/** The undo step an edit joins: the keystrokes of one category's icon are one step. */
export function sectionCoalesceKey(
  edit: MockupSectionEdit,
): string | undefined {
  return edit.kind === "updateCategory" && edit.icon !== undefined
    ? `category:${edit.category}:icon`
    : undefined;
}

/** Applies a section edit; the very spec when it changes nothing. */
export function applySectionEdit(
  spec: MockupSpecDocument,
  edit: MockupSectionEdit,
): MockupSpecDocument {
  switch (edit.kind) {
    case "addCategory":
      return addCategory(spec, edit.title);
    case "updateCategory":
      return updateCategory(spec, edit);
    case "removeCategory":
      return removeCategory(spec, edit.category);
    case "moveCategory":
      return moveCategory(spec, edit.category, edit.to);
    case "movePageTo":
      return movePageTo(spec, edit);
  }
}
