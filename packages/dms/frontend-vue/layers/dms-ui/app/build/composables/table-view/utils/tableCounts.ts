import type { TableFilter } from "../../../components/table/Table.vue";
import type { TableCountRequest } from "../useTableListData";
import { buildTableQuery, isFilterEffective } from "./tableQuery";

/** A view's counter shares the tab counters' request, under its own id. */
export const VIEW_COUNT_ID_PREFIX = "view:";
/**
 * So does the navigation badge of a tab while anything narrows its counter:
 * the badge stands for the whole page, the counter for what the table shows.
 */
export const NAV_BADGE_COUNT_ID_PREFIX = "nav:";

/** A tab that filters the table (a link tab counts its own list). */
export interface CountedTab {
  id: string;
  filters: TableFilter[];
  hasNavBadge: boolean;
}

/** A view with a counter, as opening it sets the table. */
export interface CountedView {
  id: string;
  filters: TableFilter[];
  search?: string;
}

/** What the table lists, besides its tab. */
export interface TableCountState {
  /** The filters the page sets: its URL query and route parameters. */
  scopeFilters: TableFilter[];
  /** The open tab's filter. */
  tabFilters: TableFilter[];
  /** The filters on screen: the open view's, as the user edited them. */
  columnFilters: TableFilter[];
  search?: string;
}

export interface TableCountQueriesInput extends TableCountState {
  tabs: CountedTab[];
  views: CountedView[];
  activeViewId?: string;
}

const countQuery = (
  columnFilters: TableFilter[],
  hiddenFilters: TableFilter[],
  search?: string,
) =>
  buildTableQuery({
    pagination: { pageIndex: 0, pageSize: 0 },
    sorting: [],
    columnFilters,
    hiddenFilters,
    globalFilter: search,
  });

/** Whether a tab's counter counts fewer rows than its whole page holds. */
export const isCountNarrowed = (state: TableCountState): boolean =>
  !!state.search ||
  state.scopeFilters.some(isFilterEffective) ||
  state.columnFilters.some(isFilterEffective);

/**
 * The counters of a table's tabs and views, in one request: each counts what
 * a click on it would list, the rest of the table's state kept. A tab counts
 * under the filters and search on screen; a view under the tab open, with its
 * own filters and search, which opening it applies; the open view counts the
 * rows listed. The page's URL filters apply to all. A `navBadge` tab also gets
 * a count of its filter alone, for the menu, while anything narrows its own.
 */
export function buildTableCountQueries(
  input: TableCountQueriesInput,
): TableCountRequest[] {
  const { scopeFilters, tabFilters, columnFilters, search } = input;
  const viewScope = [...scopeFilters, ...tabFilters];
  const isNarrowed = isCountNarrowed(input);
  return [
    ...input.tabs.map((tab) => ({
      id: tab.id,
      query: countQuery(
        columnFilters,
        [...scopeFilters, ...tab.filters],
        search,
      ),
    })),
    ...(isNarrowed ? input.tabs : [])
      .filter((tab) => tab.hasNavBadge)
      .map((tab) => ({
        id: `${NAV_BADGE_COUNT_ID_PREFIX}${tab.id}`,
        query: countQuery([], tab.filters),
      })),
    ...input.views.map((view) => ({
      id: `${VIEW_COUNT_ID_PREFIX}${view.id}`,
      query:
        view.id === input.activeViewId
          ? countQuery(columnFilters, viewScope, search)
          : countQuery(view.filters, viewScope, view.search),
    })),
  ];
}

/**
 * The menu badge of a `navBadge` tab, from the counts answered: its global
 * count once asked for, its own counter while nothing narrows it, else none
 * until the global count arrives.
 */
export const navBadgeCount = (
  counts: Record<string, number> | null | undefined,
  tabId: string,
  isNarrowed: boolean,
): number | undefined =>
  counts?.[`${NAV_BADGE_COUNT_ID_PREFIX}${tabId}`] ??
  (isNarrowed ? undefined : counts?.[tabId]);
