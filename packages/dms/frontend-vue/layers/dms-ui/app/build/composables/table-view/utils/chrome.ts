import type {
  TableViewChromeOptions,
  TableViewChromePreset,
} from "../../../../composables/table-view/types/config";

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

const CHROME_PRESETS: Record<TableViewChromePreset, ResolvedTableChrome> = {
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
  // The reduced list of a settings page: tabs, an open search field, quick
  // filters, sortable headers, the row menu and a short footer.
  minimal: {
    caption: false,
    search: "field",
    filters: false,
    sorting: false,
    refresh: false,
    menu: false,
    columnMenus: false,
    pageSize: false,
  },
};

/** The full chrome: what a table draws when nothing is configured. */
export const FULL_TABLE_CHROME: ResolvedTableChrome = CHROME_PRESETS.full;

const resolveSearch = (
  search: TableViewChromeOptions["search"],
  fallback: ResolvedTableChrome["search"],
): ResolvedTableChrome["search"] => {
  if (search === undefined) return fallback;
  if (search === "field") return "field";
  return search ? "toggle" : "none";
};

/**
 * The backend `chrome` option as one flag per control: a preset name, or
 * toggles laid over a preset (`"full"` when none is named).
 */
export function resolveTableChrome(
  chrome: TableViewChromePreset | TableViewChromeOptions | undefined,
): ResolvedTableChrome {
  if (!chrome) return FULL_TABLE_CHROME;
  if (typeof chrome === "string") {
    return CHROME_PRESETS[chrome] ?? FULL_TABLE_CHROME;
  }
  const base = CHROME_PRESETS[chrome.preset ?? "full"] ?? FULL_TABLE_CHROME;
  return {
    caption: chrome.caption ?? base.caption,
    search: resolveSearch(chrome.search, base.search),
    filters: chrome.filters ?? base.filters,
    sorting: chrome.sorting ?? base.sorting,
    refresh: chrome.refresh ?? base.refresh,
    menu: chrome.menu ?? base.menu,
    columnMenus: chrome.columnMenus ?? base.columnMenus,
    pageSize: chrome.pageSize ?? base.pageSize,
  };
}
