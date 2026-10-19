import { router as inertiaRouter } from "@inertiajs/vue3";
import { onBeforeUnmount, onMounted } from "vue";
import type { QueryParamFilters } from "../../../composables/table-view/types/config";
import { isLinkedVisit } from "./utils/linkedArrival";
import { queryOfUrl } from "./utils/urlFilters";
import type { TableUrlScope } from "./utils/views";

const URL_BASE = "http://dms.invalid";

/** What `useTableLinkedVisit` reads a visit against, and what it calls. */
export interface TableLinkedVisitOptions {
  route: { path: string; query: Record<string, unknown> };
  urlScope: TableUrlScope;
  queryParamFilters: QueryParamFilters | undefined;
  activeView: () => string | undefined;
  activeTab: () => string;
  canOpenView: (id: string) => boolean;
  canOpenTab: (id: string) => boolean;
  /** Opens the table on what the visit's link names, as an arrival would. */
  follow: (query: Record<string, unknown>) => void;
}

/**
 * Follows a link to the page the table is already shown on (a notification,
 * a menu entry, back and forward): Inertia keeps the page mounted, so the
 * table reads the visit's query as an arrival would (`isLinkedVisit`). A
 * visit to another page is left alone: the table is about to unmount.
 */
export function useTableLinkedVisit(options: TableLinkedVisitOptions): void {
  // The page the table is shown on, as the visit that mounted it reached it.
  const pathname = options.route.path;
  let previousQuery: Record<string, unknown> = { ...options.route.query };
  let stopFollowingVisits: (() => void) | undefined;

  onMounted(() => {
    stopFollowingVisits = inertiaRouter.on("navigate", (event) => {
      const url = event.detail.page.url;
      const query = queryOfUrl(url);
      const lastQuery = previousQuery;
      previousQuery = query;
      if (new URL(url, URL_BASE).pathname !== pathname) return;
      const isLink = isLinkedVisit({
        query,
        previousQuery: lastQuery,
        urlScope: options.urlScope,
        queryParamFilters: options.queryParamFilters,
        activeView: options.activeView(),
        activeTab: options.activeTab(),
        canOpenView: options.canOpenView,
        canOpenTab: options.canOpenTab,
      });
      if (isLink) options.follow(query);
    });
  });
  onBeforeUnmount(() => stopFollowingVisits?.());
}
