import type { SortingState, VisibilityState } from "@tanstack/vue-table";
import type {
  TableViewViewConfig,
  TableViewViewStateConfig,
} from "../../../../composables/table-view/types";
import type {
  TableDensity,
  TableFilter,
} from "../../../components/table/Table.vue";
import { mergeColumnOrder } from "../../table/utils/columnOrder";
import { isFilterEffective } from "./tableQuery";

/** Everything a view sets on the table, as the table holds it. */
export interface TableStateSnapshot {
  filters: TableFilter[];
  search: string;
  sorting: SortingState;
  visibility: VisibilityState;
  order: string[];
  display: string;
  density: TableDensity;
}

/** What a table falls back to for whatever a view leaves out. */
export interface TableStateDefaults {
  /** The table's pinned filters (`defaultFilters`) at their declared value. */
  pinnedFilters: TableFilter[];
  sorting: SortingState;
  visibility: VisibilityState;
  /** The data columns in their declared order. */
  columnOrder: string[];
  display: string;
  density: TableDensity;
  /** Displays the table offers: a view naming another one is ignored. */
  displays: ReadonlySet<string>;
}

/** A view a user saved for themselves, kept in their table preferences. */
export interface UserTableView extends TableViewViewConfig {
  /** Id of the user who saved it: nobody else is ever served it. */
  ownerId: string;
}

/** The prefix of a user view's id, never used by a module's views. */
export const USER_VIEW_ID_PREFIX = "user-";

const ID_RADIX = 36;
const ID_RANDOM_START = 2;

/** A fresh id for a view a user saves. */
export const newUserViewId = (): string =>
  `${USER_VIEW_ID_PREFIX}${Date.now().toString(ID_RADIX)}${Math.random()
    .toString(ID_RADIX)
    .slice(ID_RANDOM_START)}`;

function viewFilters(
  view: TableViewViewStateConfig,
  pinned: TableFilter[],
): TableFilter[] {
  const declared = view.filters ?? [];
  const pinnedFilters = pinned.map((filter) => {
    const own = declared.find((d) => d.accessorKey === filter.accessorKey);
    return own ? { ...filter, mode: own.mode, value: own.value } : filter;
  });
  const pinnedKeys = new Set(pinned.map((filter) => filter.accessorKey));
  const added = declared
    .filter((filter) => !pinnedKeys.has(filter.accessorKey))
    .map((filter) => ({ ...filter, pinned: false }));
  return [...pinnedFilters, ...added];
}

function viewVisibility(
  view: TableViewViewStateConfig,
  defaults: VisibilityState,
): VisibilityState {
  const visibility = { ...defaults };
  for (const key of view.columns?.visible ?? []) visibility[key] = true;
  for (const key of view.columns?.hidden ?? []) visibility[key] = false;
  return visibility;
}

/** The state of the table once `view` is opened. */
export function viewSnapshot(
  view: TableViewViewStateConfig | undefined,
  defaults: TableStateDefaults,
): TableStateSnapshot {
  const state = view ?? {};
  const display =
    state.display && defaults.displays.has(state.display)
      ? state.display
      : defaults.display;
  return {
    filters: viewFilters(state, defaults.pinnedFilters),
    search: state.search ?? "",
    sorting: state.sort
      ? state.sort.map(({ field, desc }) => ({ id: field, desc: !!desc }))
      : defaults.sorting,
    visibility: viewVisibility(state, defaults.visibility),
    order: state.columns?.order ?? [],
    display,
    density: state.density ?? defaults.density,
  };
}

const filterKey = (filter: TableFilter): string =>
  `${filter.accessorKey}\u0000${filter.mode}\u0000${JSON.stringify(filter.value)}`;

const effectiveFilterKeys = (filters: TableFilter[]): string[] =>
  filters.filter(isFilterEffective).map(filterKey).sort();

const isSameList = (a: readonly unknown[], b: readonly unknown[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

function isSameVisibility(a: VisibilityState, b: VisibilityState): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((key) => (a[key] ?? true) === (b[key] ?? true));
}

const sortKey = (sorting: SortingState): string[] =>
  sorting.map((entry) => `${entry.id}:${entry.desc ? "desc" : "asc"}`);

/**
 * Whether two table states show the same rows the same way: a filter with no
 * value counts for nothing, a search is compared trimmed, a column order on
 * the columns it moves.
 */
export function isSameTableState(
  a: TableStateSnapshot,
  b: TableStateSnapshot,
  declaredColumnOrder: string[],
): boolean {
  return (
    isSameList(
      effectiveFilterKeys(a.filters),
      effectiveFilterKeys(b.filters),
    ) &&
    a.search.trim() === b.search.trim() &&
    isSameList(sortKey(a.sorting), sortKey(b.sorting)) &&
    isSameVisibility(a.visibility, b.visibility) &&
    isSameList(
      mergeColumnOrder(a.order, declaredColumnOrder),
      mergeColumnOrder(b.order, declaredColumnOrder),
    ) &&
    a.display === b.display &&
    a.density === b.density
  );
}

/** The table's current state as a view keeps it. */
export function snapshotViewState(
  snapshot: TableStateSnapshot,
): TableViewViewStateConfig {
  const visible = Object.keys(snapshot.visibility).filter(
    (key) => snapshot.visibility[key] !== false,
  );
  const hidden = Object.keys(snapshot.visibility).filter(
    (key) => snapshot.visibility[key] === false,
  );
  return {
    filters: snapshot.filters
      .filter(isFilterEffective)
      .map(({ accessorKey, mode, value }) => ({ accessorKey, mode, value })),
    search: snapshot.search.trim() || undefined,
    sort: snapshot.sorting.map(({ id, desc }) => ({ field: id, desc })),
    columns: { visible, hidden, order: snapshot.order },
    display: snapshot.display,
    density: snapshot.density,
  };
}

/** How the URL names a view or a tab of a table on its page. */
export interface TableUrlScope {
  /** Key of the table in its page (`?<tableId>.view=`). */
  tableId?: string;
  /** The table is its page's only one: the short keys are its own. */
  isSoleTableView?: boolean;
}

/** What reading a key off the URL found. */
export interface UrlKeyReading {
  value?: string;
  /** A short key named something the table may not claim. */
  ignoredShortKey?: boolean;
}

/**
 * The value the URL gives `key` (`view`, `tab`) for this table: under its
 * prefixed key (`content.view`) or, when it is its page's only table, the
 * short one. A short key on a page with several tables is ignored.
 */
export function readTableUrlKey(
  query: Record<string, unknown>,
  scope: TableUrlScope,
  key: string,
): UrlKeyReading {
  const prefixed = scope.tableId ? query[`${scope.tableId}.${key}`] : undefined;
  if (typeof prefixed === "string" && prefixed) return { value: prefixed };
  const short = query[key];
  if (typeof short !== "string" || !short) return {};
  if (scope.isSoleTableView) return { value: short };
  return { ignoredShortKey: true };
}
