import type { NavigationMenuItem } from "@nuxt/ui";
import { isString } from "#dms-core/app/utils/type-check";
import type {
  PreviewNavigation,
  PreviewNavigationCategory,
  PreviewNavigationItem,
  PreviewNavigationSection,
} from "#dms-ui/app/entries/utils/blockPreview";
import { DEFAULT_PAGE_ICON } from "../../../utils/dms-icons";

/** The menu slot drawing a mockup section's header. */
export const MOCKUP_SECTION_SLOT = "mockup-section";

/** The menu slot drawing a mockup page's row. */
export const MOCKUP_PAGE_SLOT = "mockup-page";

const SECTION_ID_PREFIX = "mockup-section:";
const PAGE_ID_PREFIX = "mockup-page:";

/** The id of the app's own default section: the category of the pages filed under no other. */
const APP_DEFAULT_SECTION_ID = "pages";

/** How an app's own entries are drawn beside a mockup's pages: there, not reachable. */
export const DIMMED_ENTRY_CLASS = "opacity-50";

/** A mockup section's header: the default section's has no category. */
export interface MockupMenuSection {
  kind: "section";
  /** Its index among the navigation's sections, the default section being 0. */
  section: number;
  category?: PreviewNavigationCategory;
  /** Whether the section lists no page. */
  isEmpty: boolean;
}

/** A mockup page's row, at `index` in the section `section`. */
export interface MockupMenuPage {
  kind: "page";
  page: string;
  section: number;
  index: number;
  /** Whether it is the section's last page. */
  isLast: boolean;
}

export type MockupMenuEntry = MockupMenuSection | MockupMenuPage;

/** A mockup's sections as the sidebar's menu lists them, and what each entry stands for. */
export interface MockupMenu {
  groups: NavigationMenuItem[][];
  entries: ReadonlyMap<string, MockupMenuEntry>;
}

interface MockupMenuOptions {
  /** The title of the default section's header, drawn while editing beside categories. */
  defaultSection: string;
  /** Picks the page `id`. */
  select: (id: string) => void;
}

/** A section title as the merge compares it: case and spaces left out. */
function titleKey(title: string): string {
  return title.replace(/\s+/gu, "").toLocaleLowerCase();
}

function trimmedPath(path: string): string {
  return path.replace(/\/+$/u, "") || "/";
}

/** The path an entry links to, its query and fragment left out. */
function pathOf(item: NavigationMenuItem): string | undefined {
  const { to } = item;
  if (!isString(to)) return undefined;
  return trimmedPath(to.split(/[?#]/u, 1)[0] ?? "");
}

/** `items` without the entries of the `live` paths, the children of one taking its place. */
function withoutLivePages(
  items: readonly NavigationMenuItem[],
  live: ReadonlySet<string>,
): NavigationMenuItem[] {
  return items.flatMap((item) => {
    const children = item.children && withoutLivePages(item.children, live);
    const path = pathOf(item);
    if (path !== undefined && live.has(path)) return children ?? [];
    if (!children) return [item];
    return [{ ...item, children: children.length ? children : undefined }];
  });
}

function isLabelGroup(group: readonly NavigationMenuItem[]): boolean {
  return group[0]?.type === "label";
}

/**
 * The app's own menu as a mockup shows it: without the live pages the
 * mockup's pages were converted from, and without a section left with no
 * entry.
 */
function shownAppGroups(
  existing: readonly NavigationMenuItem[][],
  sections: readonly PreviewNavigationSection[],
): NavigationMenuItem[][] {
  const live = new Set(
    sections.flatMap((section) =>
      section.items.flatMap((item) =>
        item.livePage === undefined ? [] : [trimmedPath(item.livePage)],
      ),
    ),
  );
  return existing
    .map((group) => withoutLivePages(group, live))
    .filter((group) => group.some((item) => item.type !== "label"));
}

/**
 * The app section a mockup section joins: the app's default section for the
 * default section, else the one with the same title, case and spaces left
 * out. None when that section already took another.
 */
function joinedGroup(
  section: PreviewNavigationSection,
  groups: readonly NavigationMenuItem[][],
  taken: ReadonlySet<number>,
): number | undefined {
  const key = section.category && titleKey(section.category.title);
  const index = groups.findIndex((group, at) => {
    const header = group[0];
    if (taken.has(at) || !header || !isLabelGroup(group)) return false;
    return key === undefined
      ? header.id === APP_DEFAULT_SECTION_ID
      : isString(header.label) && titleKey(header.label) === key;
  });
  return index === -1 ? undefined : index;
}

/**
 * The header of a mockup section: its category's title and icon, else the
 * app section's it joins, else the default section's title.
 */
function headerItem(
  id: string,
  category: PreviewNavigationCategory | undefined,
  appHeader: NavigationMenuItem | undefined,
  defaultSection: string,
): NavigationMenuItem {
  const appLabel = isString(appHeader?.label) ? appHeader.label : undefined;
  const appIcon = isString(appHeader?.icon) ? appHeader.icon : undefined;
  return {
    id,
    type: "label",
    label: category?.title ?? appLabel ?? defaultSection,
    icon: category?.icon ?? appIcon,
    slot: MOCKUP_SECTION_SLOT,
    class: "group",
  };
}

/** A mockup page's row, which picks the page. */
function pageItem(
  id: string,
  item: PreviewNavigationItem,
  isActive: boolean,
  select: (id: string) => void,
): NavigationMenuItem {
  return {
    id,
    label: item.label,
    icon: item.icon ?? DEFAULT_PAGE_ICON,
    active: isActive,
    slot: MOCKUP_PAGE_SLOT,
    "aria-label": item.label,
    "aria-current": isActive ? "page" : undefined,
    "data-dms-preview-page": item.id,
    onSelect: () => select(item.id),
  };
}

/**
 * The sidebar's menu around a mockup: the app's own entries dimmed, as the
 * dashboard draws them, then the mockup's sections. A mockup section whose
 * title is an app section's, case and spaces left out, is listed in it, and
 * its pages without a section in the app's default one: under the mockup's
 * header, which edits the mockup's section only, the app's entries come
 * first, then the mockup's pages. An app entry a mockup page was converted
 * from is left out, so the page shows once.
 *
 * A category is a label over its pages, and a page is a row with its icon,
 * the active one highlighted. A section with no page is left out, except
 * while editing, when every category is listed, and the default section gets
 * a header too once there are categories to drag its pages from or an app
 * section it joins.
 */
export function mockupMenu(
  navigation: PreviewNavigation,
  existing: readonly NavigationMenuItem[][],
  options: MockupMenuOptions,
): MockupMenu {
  const isEditable = navigation.editable === true;
  const hasCategories = navigation.sections.some(
    (section) => section.category !== undefined,
  );
  const entries = new Map<string, MockupMenuEntry>();
  const appGroups = dimmedMenu(shownAppGroups(existing, navigation.sections));
  const taken = new Set<number>();
  const ownGroups: NavigationMenuItem[][] = [];
  navigation.sections.forEach((section, index) => {
    const isEmpty = section.items.length === 0;
    const joined =
      isEmpty && !isEditable
        ? undefined
        : joinedGroup(section, appGroups, taken);
    const app = joined === undefined ? undefined : appGroups[joined];
    const hasHeader =
      app !== undefined ||
      section.category !== undefined ||
      (isEditable && hasCategories);
    if (isEmpty && !(isEditable && hasHeader)) return;
    const group: NavigationMenuItem[] = [];
    if (hasHeader) {
      const id = `${SECTION_ID_PREFIX}${index}`;
      entries.set(id, {
        kind: "section",
        section: index,
        category: section.category,
        isEmpty,
      });
      group.push(
        headerItem(id, section.category, app?.[0], options.defaultSection),
      );
    }
    group.push(...(app?.slice(1) ?? []));
    section.items.forEach((item, at) => {
      const id = `${PAGE_ID_PREFIX}${item.id}`;
      entries.set(id, {
        kind: "page",
        page: item.id,
        section: index,
        index: at,
        isLast: at === section.items.length - 1,
      });
      group.push(
        pageItem(id, item, item.id === navigation.active, options.select),
      );
    });
    if (joined === undefined) {
      ownGroups.push(group);
      return;
    }
    taken.add(joined);
    appGroups[joined] = group;
  });
  return { groups: [...appGroups, ...ownGroups], entries };
}

function dimmedEntry(item: NavigationMenuItem): NavigationMenuItem {
  return {
    ...item,
    to: undefined,
    onSelect: undefined,
    disabled: true,
    class: [item.class, DIMMED_ENTRY_CLASS],
    children: item.children?.map(dimmedEntry),
  };
}

/** The app's own menu as a mockup draws it around its pages: every entry dimmed, none reachable. */
export function dimmedMenu(
  groups: readonly NavigationMenuItem[][],
): NavigationMenuItem[][] {
  return groups.map((group) => group.map(dimmedEntry));
}
