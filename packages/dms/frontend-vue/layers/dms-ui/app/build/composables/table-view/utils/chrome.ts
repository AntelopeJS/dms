import type { TableViewLayout } from "../../../../composables/table-view/types/config";

/** Every chrome control of a table view, resolved. */
export interface ResolvedTableChrome {
  caption: boolean;
  /** `toggle`: a button opening a field; `field`: always open; `none`. */
  search: "toggle" | "field" | "none";
  filters: boolean;
  sorting: boolean;
  refresh: boolean;
  menu: boolean;
  columnMenus: boolean;
  pageSize: boolean;
}

/** What a table has to offer, which decides the controls worth drawing. */
export interface TableChromeContext {
  /** The table names itself (`caption`). */
  hasCaption: boolean;
  /** The controller declares `@Searchable` fields. */
  isSearchable: boolean;
  /** A column is `filterable`. */
  isFilterable: boolean;
}

const LAYOUT_CHROME: Record<TableViewLayout, ResolvedTableChrome> = {
  full: {
    caption: true,
    search: "toggle",
    filters: true,
    sorting: true,
    refresh: true,
    menu: true,
    columnMenus: true,
    pageSize: true,
  },
  // The list of a settings page: tabs, an open search field, quick filters,
  // sortable headers, the row menu and a footer with the page size picker.
  compact: {
    caption: false,
    search: "field",
    filters: false,
    sorting: false,
    refresh: false,
    menu: false,
    columnMenus: false,
    pageSize: true,
  },
};

/** The full chrome: what a standalone table draws when nothing is configured. */
export const FULL_TABLE_CHROME: ResolvedTableChrome = LAYOUT_CHROME.full;

/**
 * The controls a table draws: those of its `layout`, less the ones it has
 * nothing to offer through (no caption to show, no field to search in, no
 * column to filter on).
 */
export function resolveTableChrome(
  layout: TableViewLayout | undefined,
  context: TableChromeContext,
): ResolvedTableChrome {
  const base = LAYOUT_CHROME[layout ?? "full"] ?? FULL_TABLE_CHROME;
  return {
    ...base,
    caption: base.caption && context.hasCaption,
    search: context.isSearchable ? base.search : "none",
    filters: base.filters && context.isFilterable,
  };
}
