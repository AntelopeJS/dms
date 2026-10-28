import { router as inertiaRouter } from "@inertiajs/vue3";
import { onBeforeUnmount, onMounted } from "vue";
import type { QueryParamFilters } from "../../../composables/table-view/types/config";
import { isLinkedVisit } from "./utils/linkedArrival";
import { queryOfUrl } from "./utils/urlFilters";
import type { TableUrlScope } from "./utils/views";
import type { LocationQuery } from "#dms/frontend-module";

const URL_BASE = "http://dms.invalid";

/** What `useTableLinkedVisit` reads a visit against, and what it calls. */
export interface TableLinkedVisitOptions {
  route: { path: string; query: LocationQuery };
  urlScope: TableUrlScope;
  queryParamFilters: QueryParamFilters | undefined;
  activeView: () => string | undefined;
  activeTab: () => string;
  canOpenView: (id: string) => boolean;
  canOpenTab: (id: string) => boolean;
  /** Opens the table on what the visit's link names, as an arrival would. */
  follow: (query: LocationQuery) => void;
}

/**
 * Follows a link to the page the table is already shown on (a notification,
 * a menu entry, back and forward): Inertia keeps the page mounted, so the
 * table reads the visit's query as an arrival would (`isLinkedVisit`). A
 * link clicked is announced as a client visit pushed, even to the URL shown,
 * which Inertia turns into a replace without a `navigate` event; a page
 * control rebuilding the query replaces it, and is no link. A visit to
 * another page is left alone: the table is about to unmount.
 */
export function useTableLinkedVisit(options: TableLinkedVisitOptions): void {
  const pathname = options.route.path;
  let previousQuery: LocationQuery = { ...options.route.query };

  let followedVisitId: string | undefined;
  const stops: Array<() => void> = [];

  const read = (
    url: string,
    visitId: string | undefined,
    isLinkClick: boolean,
  ) => {
    const query = queryOfUrl(url);
    const lastQuery = previousQuery;
    previousQuery = query;
    if (new URL(url, URL_BASE).pathname !== pathname) return;
    if (visitId !== undefined && visitId === followedVisitId) return;
    const isLink = isLinkedVisit({
      query,
      isLinkClick,
      previousQuery: lastQuery,
      urlScope: options.urlScope,
      queryParamFilters: options.queryParamFilters,
      activeView: options.activeView(),
      activeTab: options.activeTab(),
      canOpenView: options.canOpenView,
      canOpenTab: options.canOpenTab,
    });
    if (!isLink) return;
    followedVisitId = visitId;
    options.follow(query);
  };

  onMounted(() => {
    stops.push(
      inertiaRouter.on("navigate", (event) =>
        read(event.detail.page.url, event.detail.visitId, false),
      ),
      inertiaRouter.on("clientVisit", (event) => {
        if (event.detail.replace) return;
        read(event.detail.page.url, event.detail.visitId, true);
      }),
    );
  });
  onBeforeUnmount(() => stops.forEach((stop) => stop()));
}
