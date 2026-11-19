import type { NavigationMenuItem } from "@nuxt/ui";
import type {
  PreviewNavigation,
  PreviewNavigationCategory,
  PreviewNavigationItem,
} from "#dms-ui/app/entries/utils/blockPreview";
import { DEFAULT_PAGE_ICON } from "../../../utils/dms-icons";

/** The menu slot drawing a mockup section's header. */
export const MOCKUP_SECTION_SLOT = "mockup-section";

/** The menu slot drawing a mockup page's row. */
export const MOCKUP_PAGE_SLOT = "mockup-page";

const SECTION_ID_PREFIX = "mockup-section:";
const PAGE_ID_PREFIX = "mockup-page:";

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
  /** The default section's header: the real menu's title for its built-in Pages section. */
  defaultSection: string;
  /** Picks the page `id`. */
  select: (id: string) => void;
}

/** The header of a mockup section: its category's title and icon, else the default section's title. */
function headerItem(
  id: string,
  category: PreviewNavigationCategory | undefined,
  defaultSection: string,
): NavigationMenuItem {
  return {
    id,
    type: "label",
    label: category?.title ?? defaultSection,
    icon: category?.icon,
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
 * The sidebar's menu of a mockup: the spec's own sections alone, none of the
 * app's entries, so a mockup of an existing app starts empty and lists only
 * its own pages. Each section is a label over its pages, the default one
 * (pages without category) under the real menu's Pages header, and each page
 * a row with its icon, the active one highlighted. A section with no page is
 * left out, except while editing, when every category is listed, and the
 * default section too once there are categories to drag its pages from.
 */
export function mockupMenu(
  navigation: PreviewNavigation,
  options: MockupMenuOptions,
): MockupMenu {
  const isEditable = navigation.editable === true;
  const hasCategories = navigation.sections.some(
    (section) => section.category !== undefined,
  );
  const entries = new Map<string, MockupMenuEntry>();
  const groups: NavigationMenuItem[][] = [];
  navigation.sections.forEach((section, index) => {
    const isEmpty = section.items.length === 0;
    const isListed =
      !isEmpty ||
      (isEditable && (section.category !== undefined || hasCategories));
    if (!isListed) return;
    const id = `${SECTION_ID_PREFIX}${index}`;
    entries.set(id, {
      kind: "section",
      section: index,
      category: section.category,
      isEmpty,
    });
    const group = [headerItem(id, section.category, options.defaultSection)];
    section.items.forEach((item, at) => {
      const pageId = `${PAGE_ID_PREFIX}${item.id}`;
      entries.set(pageId, {
        kind: "page",
        page: item.id,
        section: index,
        index: at,
        isLast: at === section.items.length - 1,
      });
      group.push(
        pageItem(pageId, item, item.id === navigation.active, options.select),
      );
    });
    groups.push(group);
  });
  return { groups, entries };
}
