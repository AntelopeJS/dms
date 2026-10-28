import { router as inertiaRouter } from "@inertiajs/vue3";
import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";
import { queryOfUrl } from "./utils/urlFilters";
import type { LocationQuery } from "#dms/frontend-module";
import {
  readTableUrlKey,
  type TableUrlScope,
  writeTableUrlKey,
} from "./utils/views";

const TAB_URL_KEY = "tab";

/** The route fields the URL tab is read from. */
export interface TableUrlTabRoute {
  query: LocationQuery;
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
  query: LocationQuery,
  urlScope: TableUrlScope,
): string | undefined {
  return readTableUrlKey(query, urlScope, TAB_URL_KEY).value;
}

/**
 * Keeps the open tab and the URL in step after arrival. A tab the user opens
 * is written to the URL in place (no visit, no history entry), under the key
 * it is read from, so a reload or a shared link opens it again. A link or a
 * `router.replace` naming another tab of the same page switches to it without
 * remounting the page. A URL dropping the key, or naming a tab the table
 * cannot open in place (an unknown id, a link tab), leaves the open tab alone.
 */
export function useTableUrlTab(options: TableUrlTabOptions): void {
  const { activeTabId, urlScope } = options;

  const follow = (query: LocationQuery) => {
    const tabId = readTableUrlTab(query, urlScope);
    if (!tabId || tabId === activeTabId.value) return;
    if (!options.isOpenable(tabId)) return;
    activeTabId.value = tabId;
  };

  watch(
    () => readTableUrlTab(options.route.query, urlScope),
    () => follow(options.route.query),
  );
  let stopFollowingVisits: (() => void) | undefined;
  onMounted(() => {
    stopFollowingVisits = inertiaRouter.on("navigate", (event) =>
      follow(queryOfUrl(event.detail.page.url)),
    );
  });
  onBeforeUnmount(() => stopFollowingVisits?.());

  watch(activeTabId, (tabId) => {
    if (options.isOpenable(tabId)) {
      writeTableUrlKey(urlScope, TAB_URL_KEY, tabId);
    }
  });
}
