import type {
  ColumnDef,
  ColumnFiltersOptions,
  ColumnOrderOptions,
  ColumnPinningState,
  ColumnSizingOptions,
  ExpandedOptions,
  GlobalFilterOptions,
  PaginationOptions,
  PaginationState,
  RowSelectionOptions,
  SortingOptions,
  SortingState,
  Table,
  VisibilityState,
} from "@tanstack/vue-table";
import type { LabeledColumn } from "../../composables/table/useTableColumns";
import type { SortValueKind } from "../../composables/table-view/utils/sortableColumns";
import type {
  CustomButton,
  TableViewDisplayCapabilities,
  TableViewDisplayReorder,
  TableViewEmptyStatesConfig,
} from "../../../composables/table-view/types";
import type {
  FormContainer,
  FormPageUrls,
} from "../../composables/table-view/useTableViewConfig";
import type { CustomRowAction } from "../../../types/row-action";
import type { TableViewRowClick } from "../../utils/rowClickTrigger";
import type { RowActionConfig } from "#dms-core/app/types/row-action";
import type { TableTabItem } from "./Tabs.vue";
import type { ColumnDisplay } from "../../composables/data-types/useColumnValueRenderer";
import type { ResolvedTableChrome } from "../../composables/table-view/utils/chrome";
import type { ResolvedQuickFilter } from "../../composables/table-view/utils/quickFilters";
import type { ClearableTableFilters } from "../../composables/table/utils/clearTableFilters";
import type { EventHookOn } from "@vueuse/core";
import type { VNodeChild, ComputedRef, ModelRef } from "vue";
import type { resolveRowClickAction } from "../../../utils/rowClickAction";

export interface Data {
  [key: string]: Parameters<typeof resolveRowClickAction>[1][string];
}

export type TableDensity = "default" | "compact";

/**
 * Rows split into groups under header rows, the `grouped` display: the rows
 * arrive sorted on the grouped column, and a page starting inside a group
 * repeats its header.
 */
export interface TableRowGrouping<T = Data> {
  /** Key of the group a row belongs to. */
  keyOf: (row: T) => string;
  /** Content of a group's header row, read off its first row. */
  header: (key: string, row: T) => VNodeChild;
  /** Number of rows the group holds, once counted. */
  countOf?: (key: string) => number | undefined;
  /** A click on the header folds the group's rows. */
  collapsible?: boolean;
}

/**
 * A list growing by pages instead of paging (`loadMore`, `infinite`): what
 * the footer shows instead of its pager.
 */
export interface TableAccumulation {
  mode: "loadMore" | "infinite";
  /** Rows listed so far. */
  shown: number;
  hasMore: boolean;
  loading: boolean;
  /** Appends the next page. */
  load: () => void;
}

/** Rows ordered by hand (backend `reorder`): a handle moves a row. */
export type TableReorder = TableViewDisplayReorder;

/** Where a table draws its views (see `TableProps.viewsPlacement`). */
export type TableViewsPlacement = "band" | "header";

export type TableColumn<T> = ColumnDef<T> & {
  type?: DataTypeConfig;
  /** Wrap the default cell renderer without clipping; custom cell slots own their layout. */
  cellWrap?: boolean;
  /** Data type the cells render through instead of the column's own `type`. */
  display?: ColumnDisplay;
};

export interface TableRowActionOptions {
  add?: boolean | RowActionConfig;
  edit?: boolean | RowActionConfig;
  delete?: boolean | RowActionConfig;
  archive?: boolean | RowActionConfig;
  restore?: boolean | RowActionConfig;
  showArchived?: boolean;
  duplicate?: boolean | RowActionConfig;
  details?: boolean | RowActionConfig;
  copyLink?: boolean | RowActionConfig;
  hasSelection?: boolean;
  custom?: CustomRowAction[];
  /** Name of a row's ⋯ menu button, its `{field}` braces filled from the row. */
  menuLabel?: string;
}

export interface NavItem {
  label: string;
  icon: string;
  kbds?: string[];
  hasSubMenu?: boolean;
  showIndicator?: boolean;
  onSelect?: (e: MouseEvent) => void;
}

export interface TableRowPresenceActor {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  sessionId: string;
}

export type TableRowPresenceMap = Record<string, TableRowPresenceActor[]>;

export interface KanbanGroupByOption {
  label: string;
  value: string;
}

/** An entry of the display switcher in the table options menu. */
export interface TableViewSwitcherItem {
  id: string;
  label: string;
  icon: string;
}

export interface TableProps<T> {
  caption?: string;

  rowIdKey?: string;
  /** Field naming a row: the default name of its ⋯ menu button. */
  labelKey?: string;
  rowActions?: TableRowActionOptions;
  /**
   * What runs a row's click action: a double-click (the default) or a single
   * click (`"single"`). See `isRowClickTrigger`.
   */
  rowClick?: TableViewRowClick;
  /** Id of the row a side panel has open: the grid highlights it. */
  openRowId?: string;
  customNavItems?: NavItem[];
  tabs?: TableTabItem[];
  customButtons?: CustomButton[];
  onCustomButton?: (button: CustomButton) => void;
  onCustomRowAction?: (action: CustomRowAction, rowData: T) => void;
  componentId?: string;
  formContainer?: FormContainer;
  formPages?: FormPageUrls;
  routeParams?: Record<string, string>;
  defaultSort?: { field: string; desc?: boolean };
  /**
   * Name of the default sort's column in the toolbar sort menu: the field may
   * not be a displayed column. Defaults to the column's label.
   */
  defaultSortLabel?: string;
  /** How the default sort's values compare, for its direction label. */
  defaultSortKind?: SortValueKind;
  initialColumnVisibility?: VisibilityState;
  presenceByRow?: TableRowPresenceMap;
  canExport?: boolean;
  /**
   * Displays offered by this table view (registry ∩ config, filtered by
   * availability). When more than one, the options menu shows a "view mode"
   * switcher. In kanban mode the menu also edits the `kanbanGroupBy` model
   * among `kanbanGroupByOptions`, in grouped mode the `groupedGroupBy` model
   * among `groupedGroupByOptions`.
   */
  displays?: TableViewSwitcherItem[];
  kanbanGroupByOptions?: KanbanGroupByOption[];
  groupedGroupByOptions?: KanbanGroupByOption[];
  /** Chrome capabilities of the active display; gates filters/search/sort/columns. */
  activeCapabilities?: Required<TableViewDisplayCapabilities>;

  /**
   * Archive mode: shows the "Archived" toolbar toggle (bound to the
   * `showArchived` model). While on, the table lists archived rows under an
   * amber strip and swaps the row and bulk actions to restore.
   */
  archiveToggle?: boolean;
  /**
   * Caption count while the archived rows show: a `$` key receiving
   * `{ count }` and pluralized on it, or a text with `{count}`. Defaults to
   * "Archived: {count}".
   */
  archivedCountLabel?: string;
  /**
   * Controls drawn around the rows (the resolved backend `chrome`). Defaults
   * to the full chrome.
   */
  chrome?: ResolvedTableChrome;
  /** Placeholder of the search field. */
  searchPlaceholder?: string;
  /** Key opening the search (`defineShortcuts` notation); `shift_f` else. */
  searchShortcut?: string;
  /**
   * One-click dropdown filters of the toolbar, writing the column filters
   * (the `columnFilters` model).
   */
  quickFilters?: ResolvedQuickFilter[];
  /** Footer texts: the row count (i18n key receiving `{ count }`) and a hint. */
  footer?: TableFooterTexts;
  /**
   * The table's own rows per page, offered in the footer picker next to the
   * standard sizes.
   */
  defaultPageSize?: number;
  /**
   * Caps the rows in a scroll area of their own (any CSS length), under a
   * header band that stays in view.
   */
  maxHeight?: string;
  /**
   * Where the `views` slot is drawn: a band of its own under the header
   * (views as tabs or pills), or inside the header (a views menu).
   */
  viewsPlacement?: TableViewsPlacement;
  /** Splits the rows into groups under header rows. */
  grouping?: TableRowGrouping<T>;
  /** The list grows by pages instead of paging. */
  accumulation?: TableAccumulation;
  /** Rows ordered by hand: a drag handle in front of each row. */
  reorder?: TableReorder;
  /** Custom actions the selection bar offers (backend `bulk`). */
  bulkActions?: CustomRowAction[];
  /** What the empty body says, per reason it is empty. */
  emptyStates?: TableViewEmptyStatesConfig;
  /**
   * Filters the toolbar does not show narrow the rows (the page URL's
   * `queryParamFilters`): the table reads as filtered, and its empty body
   * says no row matches rather than that there are none yet.
   */
  hiddenFiltersApply?: boolean;
  /**
   * The page URL's filters declared `visible`: drawn as chips of the filters
   * row, each removable (`removeUrlFilter`).
   */
  urlFilters?: TableUrlFilter[];

  data?: T[] | null;
  columns?: TableColumn<T>[];
  loading?: boolean;
  /**
   * No answer has arrived yet. Without it, a load with no row listed counts
   * as the first one, which also draws the skeleton over a re-read of an
   * empty list.
   */
  firstPageLoading?: boolean;
  /**
   * Message (i18n key) of a failed data fetch; switches the empty-table panel
   * to its error state so a refused query never reads as "no data".
   */
  loadError?: string;

  orderOptions?: ColumnOrderOptions;
  sizingOptions?: Omit<ColumnSizingOptions, "onColumnSizingChange">;
  globalFilterOptions?: Omit<GlobalFilterOptions<T>, "onGlobalFilterChange">;
  columnFiltersOptions?: Omit<
    ColumnFiltersOptions<T>,
    "getFilteredRowModel" | "onColumnFiltersChange"
  >;
  sortingOptions?: Omit<
    SortingOptions<T>,
    "getSortedRowModel" | "onSortingChange"
  >;
  expandedOptions?: Omit<
    ExpandedOptions<T>,
    "getExpandedRowModel" | "onExpandedChange"
  >;
  rowSelectionOptions?: Omit<RowSelectionOptions<T>, "onRowSelectionChange">;
  paginationOptions?: Omit<PaginationOptions, "onPaginationChange">;
}

export interface TableFooterTexts {
  /** i18n key (`$`-prefixed) receiving `{ count }`, pluralized on it. */
  countLabel?: string;
  /** Hint at the right of the count. */
  hint?: string;
  /** Figures computed over the listed rows, after the count. */
  summaries?: TableFooterSummary[];
  /** A legend of a select column's values. */
  legend?: TableFooterLegendItem[];
}

/** A figure of the footer band, its value drawn (absent while it loads). */
export interface TableFooterSummary {
  id: string;
  label: string;
  value?: VNodeChild;
}

/** An entry of the footer legend: a value and its color. */
export interface TableFooterLegendItem {
  label: string;
  /** Tone of its dot. */
  color?: string;
}

export interface TableEmits<T> {
  (e: "add" | "refresh" | "exportAll"): void;
  (e: "bulkAction", action: CustomRowAction): void;
  (e: "details" | "edit", item: T): void;
  (e: "delete" | "archive" | "restore" | "export", itemIds: string[]): void;
  (e: "duplicate", itemId: string): void;
  (e: "removeUrlFilter", param: string): void;
}

export interface TableFilter {
  accessorKey: string;
  value?: unknown | unknown[];
  mode: string;
  pinned?: boolean;
  initialValue?: unknown | unknown[];
}

/** A filter the page URL applies and shows (see `TableProps.urlFilters`). */
export interface TableUrlFilter extends TableFilter {
  /** The query parameter carrying it, removed with the chip. */
  param: string;
  /** The chip's name, before the column's label. */
  label?: string;
}

export interface TableSharedData<T> {
  table: Table<T>;
  emits: TableEmits<T>;
  globalFilterState: ModelRef<string>;
  columnOrderState: ModelRef<string[]>;
  columnFiltersState: ModelRef<TableFilter[]>;
  columnVisibilityState: ModelRef<VisibilityState>;
  columnPinningState: ModelRef<ColumnPinningState>;
  sortingState: ModelRef<SortingState>;
  filtersRowOpenState: ModelRef<boolean>;
  paginationState: ModelRef<PaginationState>;
  labeledColumns: ComputedRef<LabeledColumn<T>[]>;
  customNavItems: NavItem[];
  hasCustomSort: ComputedRef<boolean>;
  /** The table's default sort, if it has one. */
  defaultSort?: { field: string; desc?: boolean };
  /** Name of the default sort's column (see `TableProps.defaultSortLabel`). */
  defaultSortLabel?: string;
  /** How the default sort's values compare (see `TableProps.defaultSortKind`). */
  defaultSortKind?: SortValueKind;
  /** The list is sorted by its default sort: the user sorted nothing. */
  isUsingDefaultSort: ComputedRef<boolean>;
  /** Goes back to the default sort (none without one). */
  resetSorting: () => void;
  hasCustomColumns: ComputedRef<boolean>;
  deleteFilter: (index: number) => void;
  /** The URL filters shown as chips (see `TableProps.urlFilters`). */
  urlFilters: TableUrlFilter[];
  /**
   * Clears everything that narrows the rows — filter chips (quick filters
   * included) and the toolbar search — and goes back to the first page.
   */
  resetFilters: () => void;
  /** Empties the toolbar search alone (the toolbar folds it). */
  clearSearch: () => void;
  /** Clears the filter chips alone, the search kept. */
  clearFilters: () => void;
  /** What `resetFilters` would clear (nothing: no clear action to offer). */
  clearableFilters: ComputedRef<ClearableTableFilters>;
  /** A search, a filter chip or a hidden filter narrows the rows. */
  isFiltered: ComputedRef<boolean>;
  /** Runs after `resetFilters` (e.g. the toolbar folds its search). */
  onFiltersCleared: EventHookOn;
  deleteSorting: (index: number) => void;
  rowCount: number;
  /** No row listed yet while the first page loads: footers draw placeholders. */
  firstPageLoading: boolean;
  displays: TableViewSwitcherItem[];
  hasDisplaySwitcher: boolean;
  activeDisplayState: ModelRef<string>;
  activeCapabilities: ComputedRef<Required<TableViewDisplayCapabilities>>;
  kanbanGroupByState: ModelRef<string>;
  kanbanGroupByOptions: KanbanGroupByOption[];
  groupedGroupByState: ModelRef<string>;
  groupedGroupByOptions: KanbanGroupByOption[];
  showArchivedState: ModelRef<boolean>;
  /** Row height: `compact` gives 36px rows under a 32px header band. */
  densityState: ModelRef<TableDensity>;
  chrome: ComputedRef<ResolvedTableChrome>;
  footer?: TableFooterTexts;
  /** See `TableProps.defaultPageSize`. */
  defaultPageSize?: number;
  /** See `TableProps.accumulation`. */
  accumulation?: TableAccumulation;
  /**
   * See `TableProps.emptyStates`: a custom display's empty body says them
   * too.
   */
  emptyStates?: TableViewEmptyStatesConfig;
  /** The add action's configured label (`$`: i18n key), if any. */
  addLabel?: string;
  /** The add action's configured icon, if any. */
  addIcon?: string;
}
