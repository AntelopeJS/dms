import { watch, type Ref } from "vue";
import { readTableUrlKey, type TableUrlScope } from "./utils/views";

const TAB_URL_KEY = "tab";

/** The route fields the URL tab is read from. */
export interface TableUrlTabRoute {
  query: Record<string, unknown>;
}

/** What `useTableUrlTab` reads the tab from and drives. */
export interface TableUrlTabOptions {
  route: TableUrlTabRoute;
  urlScope: TableUrlScope;
  /** The open tab: set from the URL on arrival by the caller, then here. */
  activeTabId: Ref<string>;
  /** Whether the table has a tab of that id it can open in place. */
  isOpenable: (tabId: string) => boolean;
}

/**
 * The tab the URL names for a table (`?<tableId>.tab=`, or `?tab=` on a page
 * carrying a single table view), as it reads on arrival.
 */
export function readTableUrlTab(
  query: Record<string, unknown>,
  urlScope: TableUrlScope,
): string | undefined {
  return readTableUrlKey(query, urlScope, TAB_URL_KEY).value;
}

/**
 * Follows the URL's tab after arrival: a link or a `router.replace` naming
 * another tab of the same page switches to it without remounting the page.
 * A URL dropping the key, or naming a tab the table cannot open in place (an
 * unknown id, a link tab), leaves the open tab alone.
 */
export function useTableUrlTab(options: TableUrlTabOptions): void {
  watch(
    () => readTableUrlTab(options.route.query, options.urlScope),
    (tabId) => {
      if (!tabId || tabId === options.activeTabId.value) return;
      if (!options.isOpenable(tabId)) return;
      options.activeTabId.value = tabId;
    },
  );
}
