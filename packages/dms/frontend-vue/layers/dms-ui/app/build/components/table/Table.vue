<script lang="ts">
import { readableNumberFormat } from "#dms-core/app/utils/formatter";
import type {
  ColumnDef,
  ColumnFiltersOptions,
  ColumnOrderOptions,
  ColumnPinningState,
  ColumnSizingOptions,
  ColumnSizingState,
  ExpandedOptions,
  ExpandedState,
  GlobalFilterOptions,
  Header,
  PaginationOptions,
  PaginationState,
  RowSelectionOptions,
  RowSelectionState,
  SortingOptions,
  SortingState,
  Table,
  VisibilityState,
} from "@tanstack/vue-table";
import type { DmsAppConfig } from "#dms-core/shared/types/app-config";
import { useTable } from "../../composables/table/useTable";
import { MAX_PAGE_SIZE } from "../../composables/table/constants";
import { useRowScrollAnchor } from "../../composables/table/useRowScrollAnchor";
import type { LabeledColumn } from "../../composables/table/useTableColumns";
import {
  defaultSortingState,
  type SortValueKind,
} from "../../composables/table-view/utils/sortableColumns";
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
import type { VNodeChild } from "vue";
import {
  REORDER_HANDLE_CLASS,
  useReorderHandles,
} from "../../composables/table-view/useReorderHandles";

export interface Data {
  [key: string]: unknown;
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
</script>

<script setup lang="ts" generic="T extends Data">
import { normalizeActionConfig } from "#dms-core/app/utils/row-action-rule-evaluator";
import {
  resolveRowClickAction,
  type RowClickAction,
} from "../../../utils/rowClickAction";
import { FlexRender } from "@tanstack/vue-table";
import {
  computed,
  type ComputedRef,
  type ModelRef,
  ref,
  shallowRef,
  useId,
  useSlots,
  useTemplateRef,
  watch,
  watchEffect,
} from "vue";
import { createEventHook, provideLocal, useElementSize } from "@vueuse/core";
import { tv } from "tailwind-variants";
import { get } from "@nuxt/ui/runtime/utils/index.js";

import TableActions from "./Actions.vue";
import TableEmpty from "./Empty.vue";
import TablePagination from "./Pagination.vue";
import TableFiltersRow from "./FiltersRow.vue";
import TableRowSelection from "./RowSelection.vue";
import TableTabs from "./Tabs.vue";
import { createTableViewDeleteShortcut } from "../../../composables/table-view/shortcuts/tableViewDelete";
import { FULL_TABLE_CHROME } from "../../composables/table-view/utils/chrome";
import { formatArchivedCount } from "../../composables/table/utils/archivedCount";
import {
  clearTableColumnFilters,
  clearTableFilters,
  clearTableSearch,
  clearableTableFilters,
  isTableNarrowed,
  type TableNarrowingState,
} from "../../composables/table/utils/clearTableFilters";
import {
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_SIZE,
} from "../../composables/table/constants";
import { mergeColumnOrder } from "../../composables/table/utils/columnOrder";
import {
  horizontalScrollEdges,
  type ScrollEdges,
} from "../../composables/table/utils/scrollEdges";
import { groupRows } from "../../composables/table-view/utils/groupedRows";
import { EYEBROW_CLASS } from "../../utils/eyebrow";
import { isRowClickTrigger } from "../../utils/rowClickTrigger";

const PANEL_MATCH_BG = "bg-(--dms-surface-card)";

const HEADER_PLACEMENT = "header";

const HEADER_MATCH_BG = "bg-(--dms-bg-muted)";

const ROW_HOVER_BG = "hover:bg-elevated";
const ROW_HOVER_CELL_BG = "group-hover:bg-elevated";

const ROW_SELECTED_BG = "data-[selected=true]:bg-primary/10";
const ROW_SELECTED_CELL_BG =
  "group-data-[selected=true]:bg-[color-mix(in_srgb,var(--ui-primary)_10%,var(--dms-surface-card))]";

const ROW_OPEN_BG =
  "data-[open=true]:bg-primary/10 data-[open=true]:[&>td:first-child]:shadow-[inset_2px_0_0_0_var(--ui-primary)]";
const ROW_OPEN_CELL_BG =
  "group-data-[open=true]:bg-[color-mix(in_srgb,var(--ui-primary)_10%,var(--dms-surface-card))]";

const ROW_EXPANDED_BG = "data-[expanded=true]:bg-elevated";
const ROW_EXPANDED_CELL_BG = "group-data-[expanded=true]:bg-elevated";

const HEADER_SCROLL_SHADOW =
  "shadow-[0_8px_10px_-8px_color-mix(in_srgb,var(--ui-border-accented)_90%,transparent)]";

const FIRST_HEAD_CELL_GUTTER = "first:ps-[18px] [th:empty:first-child+&]:ps-4";
const FIRST_ROW_CELL_GUTTER = "first:ps-[18px] [td:empty:first-child+&]:ps-4";

const theme = tv({
  slots: {
    root: "dms-card flow-root overflow-hidden",
    header:
      "flex flex-wrap items-center gap-x-3 gap-y-2.5 py-3 ps-[18px] pe-3.5",
    caption:
      "me-auto flex min-w-0 items-center gap-2.5 text-[15px] leading-[1.2] font-[650] tracking-[-0.015em] text-highlighted",
    captionLabel: "truncate",
    captionCount: "font-mono text-xs font-medium tabular-nums text-dimmed",
    captionCountPlaceholder: "h-3 w-6 rounded-[4px]",

    scrollFrame: "relative",

    scrollFade: "pointer-events-none absolute inset-y-0 z-30 w-3",
    tableRoot: "relative overflow-x-auto whitespace-nowrap",
    tableBase: "inline-block min-w-full align-middle",
    table: "text-default w-full min-w-full table-fixed text-left text-[13px]/5",
    tableCaption: "sr-only",

    loadingBar:
      "pointer-events-none absolute inset-x-0 top-9 z-40 h-0.5 overflow-hidden",
    loadingBarIndicator:
      "absolute inset-y-0 start-0 w-1/2 rounded-full bg-(--dms-accent-fill) animate-[carousel_1.3s_ease-in-out_infinite]",
    skeletonRow: "pointer-events-none",
    skeletonCell: "block h-2.5 rounded-md",

    archiveStrip:
      "flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-(--dms-warning-line) bg-(--dms-warning-tint) py-[9px] ps-[18px] pe-3.5 text-[13px] text-highlighted",
    archiveStripIcon: "size-[17px] shrink-0 text-warning",
    archiveStripText: "min-w-0",
    archiveStripTitle: "font-semibold",
    archiveStripDescription: "text-[12.5px] text-muted",
    archiveStripAction: "ms-auto",

    expandedCell:
      "border-b border-default bg-(--dms-bg-muted) p-0 whitespace-normal in-[tr:last-child]:border-b-0",

    expandedBody:
      "sticky start-0 w-[var(--dms-table-viewport,auto)] pt-4 pb-[18px] pe-[18px] ps-[18px] sm:ps-[68px]",

    emptyBody: "sticky start-0 w-[var(--dms-table-viewport,auto)]",

    headCell: `${HEADER_MATCH_BG} ${FIRST_HEAD_CELL_GUTTER} border-b-default text-dimmed group relative touch-none select-none overflow-hidden border-b h-9 px-3.5 py-0 ${EYEBROW_CLASS} last:pe-2.5`,
    headCellInternal: "flex w-full items-center justify-between gap-1",
    colOptionsTrigger: "opacity-0 transition-opacity group-hover:opacity-100",
    colResizer:
      "bg-primary/40 absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none select-none opacity-0 hover:opacity-100",

    row: `group ${ROW_SELECTED_BG} ${ROW_EXPANDED_BG} ${ROW_OPEN_BG}`,
    rowCell: `${FIRST_ROW_CELL_GUTTER} border-b-muted border-b h-11 px-3.5 py-0 text-[13px] last:pe-2.5 in-[tr:last-child]:border-b-0 group-data-[expanded=true]:border-b-transparent`,
    rowInternal: "transition-opacity duration-150",
    rowContainer: "relative",
    rowSpan: "line-clamp-1 text-ellipsis",

    rowSelection:
      "opacity-40 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
    rowAction:
      "flex items-center justify-end gap-1 opacity-40 transition-opacity group-hover:opacity-100 group-data-[selected=true]:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100",

    columnActiveSortIcon: "size-3 shrink-0 text-primary",

    groupCell: `${HEADER_MATCH_BG} border-b border-default p-0`,
    groupHeader:
      "sticky start-0 flex h-9 w-[var(--dms-table-viewport,auto)] items-center gap-2 ps-[18px] pe-3.5 text-[12.5px] text-muted",
    groupToggle:
      "inline-flex min-w-0 items-center gap-2 hover:text-highlighted",
    groupCount:
      "rounded-[4px] bg-elevated px-[5px] py-px font-mono text-[10.5px] font-semibold tabular-nums text-dimmed",

    handleHeadCell: `${HEADER_MATCH_BG} border-b-default w-8 border-b p-0`,
    handleCell:
      "border-b-muted w-8 border-b ps-2 pe-0 in-[tr:last-child]:border-b-0",
    handle: REORDER_HANDLE_CLASS,
  },
  variants: {
    cellWrap: {
      true: {
        rowCell: "py-2.5",
        rowSpan: "line-clamp-none whitespace-normal [overflow-wrap:anywhere]",
      },
    },

    headerDivided: {
      true: {
        header: "border-b border-default",
      },
    },

    tabsInline: {
      true: {
        header: "min-h-11 py-0",
      },
    },
    pinned: {
      left: {
        headCell: `${HEADER_MATCH_BG} sticky z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]`,
        rowCell: `${PANEL_MATCH_BG} ${ROW_SELECTED_CELL_BG} ${ROW_EXPANDED_CELL_BG} ${ROW_OPEN_CELL_BG} group-data-[presence=true]:bg-elevated sticky z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]`,
      },
      right: {
        headCell: `${HEADER_MATCH_BG} sticky z-10 shadow-[-2px_0_0_0_rgba(0,0,0,0.06)]`,
        rowCell: `${PANEL_MATCH_BG} ${ROW_SELECTED_CELL_BG} ${ROW_EXPANDED_CELL_BG} ${ROW_OPEN_CELL_BG} group-data-[presence=true]:bg-elevated sticky z-10 shadow-[-2px_0_0_0_rgba(0,0,0,0.06)]`,
      },
    },

    density: {
      default: "",
      compact: {
        headCell: "h-8",
        rowCell: "h-9 text-[12.5px]",
        loadingBar: "top-8",
      },
    },

    scrollArea: {
      true: {
        tableRoot: "overflow-y-auto overscroll-contain",
        table: "border-separate border-spacing-0",
        headCell: "sticky top-0 z-20",
      },
    },
    scrolled: {
      true: "",
    },
    side: {
      start: {
        scrollFade: "shadow-[inset_12px_0_10px_-10px_rgb(0_0_0/0.28)]",
      },
      end: {
        scrollFade: "shadow-[inset_-12px_0_10px_-10px_rgb(0_0_0/0.28)]",
      },
    },

    archived: {
      true: {
        rowCell: "text-muted",
        rowAction: "opacity-100",
      },
    },

    loading: {
      true: {
        row: "cursor-wait hover:bg-transparent",
        rowInternal: "opacity-60 delay-200",
      },
    },
    rowClickable: {
      true: "",
    },
    isResizing: {
      true: {
        colResizer: "opacity-100",
      },
    },
    rowSelected: {
      true: {
        rowSelection: "opacity-100",
      },
    },

    prominent: {
      true: {
        rowAction: "opacity-100",
      },
    },
    presence: {
      true: {
        row: "bg-elevated",
      },
    },
  },
  compoundVariants: [
    {
      loading: false,
      rowClickable: true,
      class: {
        row: ROW_HOVER_BG,
      },
    },
    {
      loading: false,
      rowClickable: true,
      pinned: ["left", "right"],
      class: {
        rowCell: ROW_HOVER_CELL_BG,
      },
    },
    {
      scrollArea: true,
      pinned: ["left", "right"],
      class: {
        headCell: "z-30",
      },
    },
    {
      scrollArea: true,
      scrolled: true,
      class: {
        headCell: HEADER_SCROLL_SHADOW,
      },
    },
  ],
});

const DEFAULT_CAPABILITIES = resolveDisplayCapabilities({
  columnManagement: true,
});

const props = withDefaults(defineProps<TableProps<T>>(), {
  firstPageLoading: undefined,
});
const emits = defineEmits<TableEmits<T>>();

const appConfig = useDmsAppConfig() as DmsAppConfig & {
  ui: { table: Partial<typeof theme> };
};

const globalFilterState = defineModel<string>("globalFilter", {
  default: "",
});
const columnFiltersState = defineModel<TableFilter[]>("columnFilters", {
  default: (): TableFilter[] => [],
});
const columnOrderState = defineModel<string[]>("columnOrderState", {
  default: (): string[] => [],
});
const columnVisibilityState = defineModel<VisibilityState>("columnVisibility", {
  default: (): VisibilityState => ({}),
});
const columnPinningState = defineModel<ColumnPinningState>("columnPinning", {
  default: (): ColumnPinningState => ({}),
});
const columnSizingState = defineModel<ColumnSizingState>("columnSizing", {
  default: (): ColumnSizingState => ({}),
});
const rowSelectionState = defineModel<RowSelectionState>("rowSelection", {
  default: (): RowSelectionState => ({}),
});
const sortingState = defineModel<SortingState>("sorting", {
  default: (): SortingState => [],
});
const filtersRowOpen = defineModel<boolean>("filtersRowOpen", {
  default: false,
});
const activeTabId = defineModel<string>("activeTab", { default: "" });
const activeDisplayState = defineModel<string>("activeDisplay", {
  default: "table",
});
const kanbanGroupByState = defineModel<string>("kanbanGroupBy", {
  default: "",
});
const groupedGroupByState = defineModel<string>("groupedGroupBy", {
  default: "",
});
const expandedState = defineModel<ExpandedState>("expanded", {
  default: (): ExpandedState => ({}),
});
const showArchivedState = defineModel<boolean>("showArchived", {
  default: false,
});
const densityState = defineModel<TableDensity>("density", {
  default: "default",
});

const allMatchingState = defineModel<boolean>("allMatching", {
  default: false,
});

const slots = useSlots();

const isExpandable = !!slots.expanded;

const tableDomId = `dms-table-${useId()}`;
const expandedRowDomId = (rowId: string): string =>
  `${tableDomId}-detail-${rowId.replace(/\s+/g, "_")}`;

const isShowingArchived = computed(
  () => !!props.archiveToggle && showArchivedState.value,
);

const SKELETON_MAX_ROW_COUNT = MAX_PAGE_SIZE;
const SKELETON_TOTAL_FADE = 0.7;
const SKELETON_WIDTHS = ["62%", "48%", "70%", "54%", "40%"];
const skeletonWidth = (rowIndex: number, columnIndex: number): string =>
  SKELETON_WIDTHS[(rowIndex + columnIndex) % SKELETON_WIDTHS.length]!;

const hasScrollArea = computed(() => !!props.maxHeight);
const isScrolled = ref(false);

const scrollEdges = ref<ScrollEdges>({ start: false, end: false });
const syncScrollEdges = () => {
  const area = tableRootRef.value;
  if (area) scrollEdges.value = horizontalScrollEdges(area);
};
const onTableScroll = (event: Event) => {
  syncScrollEdges();
  if (!hasScrollArea.value) return;
  isScrolled.value = (event.target as HTMLElement).scrollTop > 0;
};

const tableRootRef = useTemplateRef<HTMLElement>("tableRoot");
const { width: tableViewportWidth } = useElementSize(tableRootRef);
const tableBaseRef = useTemplateRef<HTMLElement>("tableBase");
const { width: tableContentWidth } = useElementSize(tableBaseRef);
watch([tableViewportWidth, tableContentWidth], syncScrollEdges);

const tableHeadRef = useTemplateRef<HTMLElement>("tableHead");
const { height: tableHeadHeight } = useElementSize(tableHeadRef, undefined, {
  box: "border-box",
});
const rootStyle = computed(() => ({
  "--dms-table-head-height":
    tableHeadHeight.value > 0 ? `${tableHeadHeight.value}px` : undefined,
}));
const tableRootStyle = computed(() => ({
  maxHeight: props.maxHeight,
  "--dms-table-viewport":
    tableViewportWidth.value > 0 ? `${tableViewportWidth.value}px` : undefined,
}));

const syncClippedTitle = (event: MouseEvent) => {
  const cell = event.currentTarget as HTMLElement;
  if (cell.scrollWidth > cell.clientWidth) {
    cell.title = cell.textContent?.trim() ?? "";
  } else {
    cell.removeAttribute("title");
  }
};
const paginationState = defineModel<PaginationState>("pagination", {
  default: (): PaginationState => ({
    pageIndex: DEFAULT_PAGE_INDEX,
    pageSize: DEFAULT_PAGE_SIZE,
  }),
});

const isFirstPageLoading = computed(
  () => props.firstPageLoading ?? (!!props.loading && !props.data?.length),
);
const skeletonRowCount = computed(() =>
  Math.min(
    paginationState.value.pageSize || DEFAULT_PAGE_SIZE,
    SKELETON_MAX_ROW_COUNT,
  ),
);
const skeletonRowOpacity = (rowIndex: number): number =>
  1 - ((rowIndex - 1) * SKELETON_TOTAL_FADE) / skeletonRowCount.value;

const onResize = (
  event: MouseEvent | TouchEvent,
  header: Header<T, unknown>,
) => {
  header.getResizeHandler()?.(event);
};

const PRESENCE_RAIL_WIDTH = 2;
const PRESENCE_RAIL_WIDTH_PX = `${PRESENCE_RAIL_WIDTH}px`;

const PRESENCE_RAIL_ACTIVE_BG = "bg-secondary";
const SELECTION_RAIL_BG = "bg-primary";

const hasPresenceRail = computed(() => props.presenceByRow !== undefined);

const leadingCellCount = computed(
  () => (hasPresenceRail.value ? 1 : 0) + (props.reorder ? 1 : 0),
);

const reorderHandles = useReorderHandles({
  reorder: () => props.reorder,
  count: () => table.getRowModel().rows.length,
});

const PINNED_MAX_VIEWPORT_SHARE = 0.6;
const stickyPinnedSides = computed(() => {
  const budget = tableViewportWidth.value * PINNED_MAX_VIEWPORT_SHARE;
  const left = table.getLeftTotalSize();
  const right = table.getRightTotalSize();
  if (!budget || left + right <= budget) return { left: true, right: true };
  const keepLeft = left < right && left <= budget;
  const keepRight = left >= right && right <= budget;
  return { left: keepLeft, right: keepRight };
});

const scrollFadeInsets = computed(() => {
  const sides = stickyPinnedSides.value;
  return {
    start:
      (sides.left ? table.getLeftTotalSize() : 0) +
      (hasPresenceRail.value ? PRESENCE_RAIL_WIDTH : 0),
    end: sides.right ? table.getRightTotalSize() : 0,
  };
});

const getStickyPin = (column: { getIsPinned: () => unknown }) => {
  const pinned = column.getIsPinned();
  if (pinned === "left" && stickyPinnedSides.value.left) return "left";
  if (pinned === "right" && stickyPinnedSides.value.right) return "right";
  return undefined;
};

const getPinnedLeftOffset = (column: {
  getIsPinned: () => unknown;
  getStart: (pos: "left") => number;
}) => {
  if (getStickyPin(column) !== "left") return undefined;
  const base = column.getStart("left");
  const rail = hasPresenceRail.value ? PRESENCE_RAIL_WIDTH : 0;
  return `${base + rail}px`;
};

const getPinnedRightOffset = (column: {
  getIsPinned: () => unknown;
  getAfter: (pos: "right") => number;
}) => {
  if (getStickyPin(column) !== "right") return undefined;
  return `${column.getAfter("right")}px`;
};

const getPinnedVariant = getStickyPin;

const MIN_SCROLLING_COLUMN_WIDTH = 120;
const scrollingColumnMaxWidth = computed(() => {
  const viewport = tableViewportWidth.value;
  if (!viewport) return Infinity;
  const sides = stickyPinnedSides.value;
  const sticky =
    (sides.left ? table.getLeftTotalSize() : 0) +
    (sides.right ? table.getRightTotalSize() : 0) +
    (hasPresenceRail.value ? PRESENCE_RAIL_WIDTH : 0);
  return Math.max(viewport - sticky, MIN_SCROLLING_COLUMN_WIDTH);
});

const getHeaderWidth = (header: Header<T, unknown>): string => {
  const size = header.getSize();
  if (getStickyPin(header.column)) return `${size}px`;
  return `${Math.min(size, scrollingColumnMaxWidth.value)}px`;
};

const headerAriaSort = (
  column: Header<T, unknown>["column"],
): "ascending" | "descending" | "none" | undefined => {
  if (!column.getCanSort()) return undefined;
  const sorted = column.getIsSorted();
  if (sorted === "asc") return "ascending";
  if (sorted === "desc") return "descending";
  return "none";
};

const isUsingDefaultSort = computed(() => {
  if (!props.defaultSort) return false;
  if (sortingState.value.length !== 1) return false;
  const [current] = sortingState.value;
  if (!current) return false;
  return (
    current.id === props.defaultSort.field &&
    current.desc === (props.defaultSort.desc ?? false)
  );
});

const uiTableRoot = tv({
  extend: tv(theme),
  ...(appConfig.ui?.table || {}),
});
const uiTable = computed(() =>
  uiTableRoot({
    density: densityState.value,
    scrollArea: hasScrollArea.value,
    scrolled: isScrolled.value,
    archived: isShowingArchived.value,
  }),
);

const {
  table,
  declaredColumnOrder,
  labeledColumns,
  deleteFilter,
  deleteSorting,
} = useTable<T>({
  tableProps: props,
  emits,
  states: {
    globalFilterState,
    columnFiltersState,
    columnOrderState,
    columnVisibilityState,
    columnPinningState,
    columnSizingState,
    rowSelectionState,
    sortingState,
    expandedState,
    paginationState,
  },
  ui: uiTable,
  expandable: isExpandable,
  expandedRowDomId,
  showArchived: props.archiveToggle ? isShowingArchived : undefined,
  columnMenus: (props.chrome ?? FULL_TABLE_CHROME).columnMenus,
});

const rowCount = computed(() => props.paginationOptions?.rowCount ?? 0);

type TableRow = ReturnType<typeof table.getRowModel>["rows"][number];

/** A line of the table body: a row, or the header of the group it opens. */
interface BodyEntry {
  kind: "row" | "group";
  id: string;
  /** The row, or the first row of the group a header opens. */
  row: TableRow;
  /** Group key, on a group header. */
  key?: string;
  /**
   * Draws a group header with the grouping it was listed under: a header
   * still rendering once the grouping is gone reads it, not the prop.
   */
  header?: () => VNodeChild;
}

const GROUP_ENTRY_PREFIX = "group:";
const collapsedGroups = ref<string[]>([]);
const toggleGroup = (key: string) => {
  collapsedGroups.value = collapsedGroups.value.includes(key)
    ? collapsedGroups.value.filter((collapsed) => collapsed !== key)
    : [...collapsedGroups.value, key];
};

const bodyEntries = computed<BodyEntry[]>(() => {
  const rows = table.getRowModel().rows;
  const grouping = props.grouping;
  if (!grouping) return rows.map((row) => ({ kind: "row", id: row.id, row }));
  const entries: BodyEntry[] = [];
  for (const group of groupRows(rows, (row) => grouping.keyOf(row.original))) {
    const { key } = group;
    const [first] = group.rows as [TableRow];
    entries.push({
      kind: "group",
      id: GROUP_ENTRY_PREFIX + key,
      row: first,
      key,
      header: () => grouping.header(key, first.original),
    });
    if (collapsedGroups.value.includes(key)) continue;
    for (const row of group.rows) {
      entries.push({ kind: "row", id: row.id, row });
    }
  }
  return entries;
});

useRowScrollAnchor(tableRootRef, () =>
  bodyEntries.value
    .filter((entry) => entry.kind === "row")
    .map((entry) => entry.id),
);

const { t, locale } = useI18n();

const formattedRowCount = computed(() =>
  readableNumberFormat(locale.value).format(rowCount.value),
);

const captionCountLabel = computed(() =>
  isShowingArchived.value
    ? formatArchivedCount(
        t,
        rowCount.value,
        formattedRowCount.value,
        props.archivedCountLabel,
      )
    : formattedRowCount.value,
);

const hasTabs = computed(() => (props.tabs?.length ?? 0) > 0);
const hasViewsBand = computed(
  () => !!slots.views && props.viewsPlacement === "band",
);
const hasViewsInHeader = computed(
  () => !!slots.views && props.viewsPlacement === "header",
);

const resolvedChrome = computed<ResolvedTableChrome>(
  () => props.chrome ?? FULL_TABLE_CHROME,
);

const tabsInline = computed(
  () => hasTabs.value && !resolvedChrome.value.caption,
);

const toolbarButtons = computed(() =>
  (props.customButtons ?? []).filter(
    (button) => button.placement !== HEADER_PLACEMENT,
  ),
);
const canAddFromToolbar = computed(() => {
  const add = normalizeActionConfig(props.rowActions?.add);
  return !!add.isEnabled && add.placement !== HEADER_PLACEMENT;
});

const addLabel = computed(
  () => normalizeActionConfig(props.rowActions?.add).label,
);
const addIcon = computed(
  () => normalizeActionConfig(props.rowActions?.add).icon,
);

const hasBulkActions = computed(
  () =>
    normalizeActionConfig(props.rowActions?.delete).isEnabled ||
    normalizeActionConfig(props.rowActions?.archive).isEnabled ||
    normalizeActionConfig(props.rowActions?.restore).isEnabled ||
    !!props.canExport ||
    (props.bulkActions?.length ?? 0) > 0,
);

const resolvedCapabilities = computed<Required<TableViewDisplayCapabilities>>(
  () => props.activeCapabilities ?? DEFAULT_CAPABILITIES,
);

const narrowingState: TableNarrowingState = {
  columnFilters: columnFiltersState,
  globalFilter: globalFilterState,
  pagination: paginationState,
  searchApplies: computed(() => resolvedCapabilities.value.search),
  hiddenFiltersApply: computed(() => !!props.hiddenFiltersApply),
};
const filtersCleared = createEventHook();
const resetFilters = () => {
  clearTableFilters(narrowingState);
  void filtersCleared.trigger();
};

const clearSearch = () => {
  clearTableSearch(narrowingState);
  void filtersCleared.trigger();
};
const clearFilters = () => clearTableColumnFilters(narrowingState);
const clearableFilters = computed(() => clearableTableFilters(narrowingState));
const isFiltered = computed(() => isTableNarrowed(narrowingState));

watch(columnOrderState, (order) => {
  const merged = mergeColumnOrder(order, declaredColumnOrder);
  if (!isSameColumnList(merged, order)) columnOrderState.value = merged;
});
const baselineColumnOrder = declaredColumnOrder;

function isSameColumnList(a: readonly unknown[], b: readonly unknown[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
const baselineColumnPinning = JSON.parse(
  JSON.stringify(columnPinningState.value),
) as ColumnPinningState;

const hasCustomSort = computed(() => {
  const sorting = sortingState.value;
  if (!props.defaultSort) return sorting.length > 0;
  if (sorting.length === 0) return true;
  return !isUsingDefaultSort.value;
});

const resetSorting = () => {
  sortingState.value = defaultSortingState(props.defaultSort);
};

const arePinningEqual = (
  a: ColumnPinningState,
  b: ColumnPinningState,
): boolean => {
  return (
    isSameColumnList(a.left ?? [], b.left ?? []) &&
    isSameColumnList(a.right ?? [], b.right ?? [])
  );
};

const hasCustomColumns = computed(() => {
  if (!isSameColumnList(columnOrderState.value, baselineColumnOrder))
    return true;
  if (!arePinningEqual(columnPinningState.value, baselineColumnPinning))
    return true;

  if (props.initialColumnVisibility) {
    const current = columnVisibilityState.value;
    const baseline = props.initialColumnVisibility;
    const keys = new Set([...Object.keys(current), ...Object.keys(baseline)]);
    for (const key of keys) {
      const a = current[key] ?? true;
      const b = baseline[key] ?? true;
      if (a !== b) return true;
    }
  }

  return false;
});

const tableSharedData = shallowRef<TableSharedData<T>>(null!);

watchEffect(() => {
  tableSharedData.value = {
    table,
    emits,
    globalFilterState,
    columnFiltersState,
    columnOrderState,
    columnVisibilityState,
    columnPinningState,
    sortingState,
    filtersRowOpenState: filtersRowOpen,
    paginationState,
    labeledColumns,
    customNavItems: props.customNavItems || [],
    hasCustomSort,
    defaultSort: props.defaultSort,
    defaultSortLabel: props.defaultSortLabel,
    defaultSortKind: props.defaultSortKind,
    isUsingDefaultSort,
    resetSorting,
    hasCustomColumns,
    deleteFilter,
    urlFilters: props.urlFilters ?? [],
    resetFilters,
    clearSearch,
    clearFilters,
    clearableFilters,
    isFiltered,
    onFiltersCleared: filtersCleared.on,
    deleteSorting,
    rowCount: rowCount.value,
    firstPageLoading: isFirstPageLoading.value,
    displays: props.displays || [],
    hasDisplaySwitcher: (props.displays?.length ?? 0) > 1,
    activeDisplayState,
    activeCapabilities: resolvedCapabilities,
    kanbanGroupByState,
    kanbanGroupByOptions: props.kanbanGroupByOptions || [],
    groupedGroupByState,
    groupedGroupByOptions: props.groupedGroupByOptions || [],
    showArchivedState,
    densityState,
    chrome: resolvedChrome,
    footer: props.footer,
    defaultPageSize: props.defaultPageSize,
    accumulation: props.accumulation,
    emptyStates: props.emptyStates,
    addLabel: addLabel.value,
    addIcon: addIcon.value,
  };
});

provideLocal("tableSharedData", tableSharedData);

const DEFAULT_ROW_ID_KEY = "_id";
const rowIdKey = props.rowIdKey ?? DEFAULT_ROW_ID_KEY;
const hoveredRowId = ref<string | null>(null);

const handleRowHover = (row: { original: T; id: string }) => {
  hoveredRowId.value = get(row.original, rowIdKey) as string;
};

const handleRowLeave = () => {
  hoveredRowId.value = null;
};

const getRowPresence = (row: T): TableRowPresenceActor[] | undefined => {
  if (!props.presenceByRow) return undefined;
  const id = get(row, rowIdKey) as string | undefined;
  if (!id) return undefined;
  const actors = props.presenceByRow[id];
  return actors && actors.length > 0 ? actors : undefined;
};

const presenceTooltipText = (actors: TableRowPresenceActor[]): string =>
  t("dms.realtime.row_edited_by", {
    names: actors.map((a) => a.displayName || a.id).join(", "),
  });

const rowClickAction = (row: T): RowClickAction | undefined =>
  resolveRowClickAction(props.rowActions, row as Record<string, unknown>);

const isRowClickable = (row: T): boolean => rowClickAction(row) !== undefined;

const runRowClickAction = (row: T) => {
  const action = rowClickAction(row);
  if (!action) return;
  if (typeof action === "string") {
    emits(action, row);
    return;
  }
  props.onCustomRowAction?.(action, row);
};

const handleRowPointer = (event: MouseEvent, row: T) => {
  if (!isRowClickTrigger(props.rowClick, event)) return;
  runRowClickAction(row);
};

const isOpenRow = (row: T): boolean =>
  props.openRowId !== undefined &&
  String(get(row, rowIdKey)) === props.openRowId;

const isSingleClickRow = (row: T): boolean =>
  props.rowClick === "single" && isRowClickable(row);

const presenceRailBackground = (row: T): string => {
  if (getRowPresence(row)) return PRESENCE_RAIL_ACTIVE_BG;
  if (props.loading || !isRowClickable(row)) return PANEL_MATCH_BG;
  return `${PANEL_MATCH_BG} ${ROW_HOVER_CELL_BG}`;
};

defineShortcuts({
  delete: createTableViewDeleteShortcut(
    hoveredRowId,
    props.rowActions,
    (ids: string[]) => emits("delete", ids),
  ),
});
</script>

<template>
  <div :class="uiTable.root()" :style="rootStyle">
    <template v-if="resolvedCapabilities.header">
      <header
        :class="
          uiTable.header({
            headerDivided: (!hasTabs && !hasViewsBand) || tabsInline,
            tabsInline,
          })
        "
      >
        <TableTabs
          v-if="tabsInline && tabs"
          v-model="activeTabId"
          :tabs="tabs"
          :label="caption"
          inline
        />
        <h2 v-else-if="resolvedChrome.caption" :class="uiTable.caption()">
          <span :class="uiTable.captionLabel()" @mouseenter="syncClippedTitle">
            {{ caption }}
          </span>
          <USkeleton
            :aria-label="t('dms.a11y.loading')"
            v-if="isFirstPageLoading"
            aria-hidden="true"
            :class="uiTable.captionCountPlaceholder()"
          />
          <span v-else-if="rowCount > 0" :class="uiTable.captionCount()">
            {{ captionCountLabel }}
          </span>
        </h2>

        <slot v-if="hasViewsInHeader" name="views" />

        <TableActions
          v-model:global-filter="globalFilterState"
          v-model:column-visibility="columnVisibilityState"
          v-model:sorting="sortingState"
          v-model:show-archived="showArchivedState"
          :table
          :can-add-row="canAddFromToolbar"
          :add-label="addLabel"
          :add-icon="addIcon"
          :archive-toggle="archiveToggle"
          :custom-buttons="toolbarButtons"
          :on-custom-button="onCustomButton"
          :chrome="resolvedChrome"
          :search-placeholder="searchPlaceholder"
          :search-shortcut="searchShortcut"
          :quick-filters="quickFilters"
          :class="{
            'ms-auto': !resolvedChrome.caption && !tabsInline,
            'py-2': tabsInline,
          }"
        />
      </header>

      <slot v-if="hasViewsBand" name="views" />

      <TableTabs
        v-if="hasTabs && tabs && !tabsInline"
        v-model="activeTabId"
        :tabs="tabs"
      />

      <TableFiltersRow
        v-if="
          (filtersRowOpen || !!urlFilters?.length) &&
          resolvedCapabilities.filters &&
          resolvedChrome.filters
        "
      />

      <div
        v-if="isShowingArchived"
        role="status"
        :class="uiTable.archiveStrip()"
      >
        <UIcon name="i-ph-archive" :class="uiTable.archiveStripIcon()" />
        <span :class="uiTable.archiveStripText()">
          <strong :class="uiTable.archiveStripTitle()">
            {{ t("dms.table.archive_strip_title") }}
          </strong>
          {{ " " }}
          <span :class="uiTable.archiveStripDescription()">
            {{ t("dms.table.archive_strip_description") }}
          </span>
        </span>
        <UButton
          :label="t('dms.table.show_active')"
          :icon="appConfig.ui.icons.arrowLeft"
          color="neutral"
          variant="ghost"
          size="xs"
          :class="uiTable.archiveStripAction()"
          @click="showArchivedState = false"
        />
      </div>

      <TableRowSelection
        v-if="hasBulkActions"
        v-model:row-selection="rowSelectionState"
        v-model:all-matching="allMatchingState"
        :row-actions="rowActions"
        :bulk-actions="bulkActions"
        :total="rowCount"
        :can-export="canExport"
        :archived="isShowingArchived"
      />
    </template>

    <!-- A strip the table view adds over its rows (the live hold's "N new"),
         shown whichever chrome the display keeps. -->
    <slot name="notice" />

    <slot name="body" :table="table">
      <div :class="uiTable.scrollFrame()">
        <section
          ref="tableRoot"
          :class="uiTable.tableRoot()"
          :style="tableRootStyle"
          @scroll.passive="onTableScroll"
        >
          <div
            v-if="loading && !isFirstPageLoading"
            aria-hidden="true"
            :class="uiTable.loadingBar()"
          >
            <span :class="uiTable.loadingBarIndicator()" />
          </div>

          <div ref="tableBase" :class="uiTable.tableBase()">
            <table :class="uiTable.table()">
              <caption v-if="caption" :class="uiTable.tableCaption()">
                {{ caption }}
              </caption>

              <thead ref="tableHead">
                <tr
                  v-for="headerGroup in table.getHeaderGroups()"
                  :key="headerGroup.id"
                >
                  <th
                    v-if="hasPresenceRail"
                    :class="[
                      HEADER_MATCH_BG,
                      'border-b-default sticky left-0 z-30 border-b p-0',
                      hasScrollArea && 'top-0 z-40',
                    ]"
                    :style="{
                      width: PRESENCE_RAIL_WIDTH_PX,
                      minWidth: PRESENCE_RAIL_WIDTH_PX,
                    }"
                  />
                  <th
                    v-if="reorder"
                    :class="uiTable.handleHeadCell()"
                    :aria-label="t('dms.table.reorder.column')"
                  />
                  <th
                    v-for="header in headerGroup.headers"
                    :key="header.id"
                    :colspan="header.colSpan"
                    :aria-sort="headerAriaSort(header.column)"
                    :data-pinned="header.column.getIsPinned()"
                    :class="
                      uiTable.headCell({
                        pinned: getPinnedVariant(header.column),
                      })
                    "
                    :style="{
                      width: getHeaderWidth(header),
                      left: getPinnedLeftOffset(header.column),
                      right: getPinnedRightOffset(header.column),
                    }"
                  >
                    <slot
                      :name="`${header.id}-header`"
                      v-bind="header.getContext()"
                    >
                      <FlexRender
                        v-if="!header.isPlaceholder"
                        :render="header.column.columnDef.header"
                        :props="header.getContext()"
                      />

                      <div
                        v-if="header.column.getCanResize()"
                        :class="
                          uiTable.colResizer({
                            isResizing: header.column.getIsResizing(),
                          })
                        "
                        @dblclick="header.column.resetSize()"
                        @mousedown="onResize($event, header)"
                        @touchstart="onResize($event, header)"
                      />
                    </slot>
                  </th>
                </tr>
              </thead>

              <tbody>
                <template v-if="table.getRowModel().rows?.length">
                  <template
                    v-for="{ kind, id, row, key, header } in bodyEntries"
                    :key="id"
                  >
                    <tr v-if="kind === 'group' && grouping">
                      <td
                        :colspan="
                          row.getVisibleCells().length + leadingCellCount
                        "
                        :class="uiTable.groupCell()"
                      >
                        <div :class="uiTable.groupHeader()">
                          <component
                            :is="grouping.collapsible ? 'button' : 'span'"
                            :type="grouping.collapsible ? 'button' : undefined"
                            :aria-expanded="
                              grouping.collapsible
                                ? !collapsedGroups.includes(key!)
                                : undefined
                            "
                            :class="uiTable.groupToggle()"
                            @click="grouping.collapsible && toggleGroup(key!)"
                          >
                            <UIcon
                              v-if="grouping.collapsible"
                              :name="
                                collapsedGroups.includes(key!)
                                  ? 'i-ph-caret-right'
                                  : 'i-ph-caret-down'
                              "
                              class="size-3"
                            />
                            <component :is="header" />
                          </component>
                          <span
                            v-if="grouping.countOf?.(key!) !== undefined"
                            :class="uiTable.groupCount()"
                          >
                            {{ grouping.countOf(key!) }}
                          </span>
                        </div>
                      </td>
                    </tr>
                    <template v-else>
                      <tr
                        :data-row-id="id"
                        :data-selected="row.getIsSelected()"
                        :data-expanded="row.getIsExpanded()"
                        :data-open="isOpenRow(row.original) || undefined"
                        :aria-current="isOpenRow(row.original) || undefined"
                        :data-presence="!!getRowPresence(row.original)"
                        :title="
                          getRowPresence(row.original)
                            ? presenceTooltipText(getRowPresence(row.original)!)
                            : undefined
                        "
                        :class="[
                          uiTable.row({
                            loading,
                            rowClickable: isRowClickable(row.original),
                            presence: !!getRowPresence(row.original),
                          }),
                          { 'cursor-pointer': isSingleClickRow(row.original) },
                        ]"
                        @click="handleRowPointer($event, row.original)"
                        @dblclick="handleRowPointer($event, row.original)"
                        @mouseenter="handleRowHover(row)"
                        @mouseleave="handleRowLeave"
                        @dragover="reorderHandles.allowDrop"
                        @drop="reorderHandles.drop(row.index)"
                      >
                        <td
                          v-if="hasPresenceRail"
                          :class="[
                            'border-b-muted sticky left-0 z-30 border-b p-0 in-[tr:last-child]:border-b-0',
                            row.getIsSelected() && !getRowPresence(row.original)
                              ? SELECTION_RAIL_BG
                              : presenceRailBackground(row.original),
                          ]"
                          :style="{
                            width: PRESENCE_RAIL_WIDTH_PX,
                            minWidth: PRESENCE_RAIL_WIDTH_PX,
                          }"
                        />
                        <td v-if="reorder" :class="uiTable.handleCell()">
                          <button
                            v-bind="reorderHandles.handleFor(row.index)"
                            :class="uiTable.handle()"
                          >
                            <UIcon name="i-ph-dots-six-vertical" />
                          </button>
                        </td>
                        <td
                          v-for="cell in row.getVisibleCells()"
                          :key="cell.id"
                          :data-pinned="cell.column.getIsPinned()"
                          :class="
                            uiTable.rowCell({
                              pinned: getPinnedVariant(cell.column),
                              loading,
                              rowClickable: isRowClickable(row.original),
                              cellWrap: (
                                cell.column.columnDef as TableColumn<T>
                              ).cellWrap,
                            })
                          "
                          :style="{
                            left: getPinnedLeftOffset(cell.column),
                            right: getPinnedRightOffset(cell.column),
                          }"
                        >
                          <div :class="uiTable.rowContainer()">
                            <div :class="uiTable.rowInternal({ loading })">
                              <slot
                                :name="`${cell.column.id}-cell`"
                                v-bind="cell.getContext()"
                              >
                                <div
                                  :class="
                                    uiTable.rowSpan({
                                      cellWrap: (
                                        cell.column.columnDef as TableColumn<T>
                                      ).cellWrap,
                                    })
                                  "
                                  @mouseenter="syncClippedTitle"
                                >
                                  <FlexRender
                                    :render="cell.column.columnDef.cell"
                                    :props="cell.getContext()"
                                  />
                                </div>
                              </slot>
                            </div>
                          </div>
                        </td>
                      </tr>
                      <tr
                        v-if="row.getIsExpanded()"
                        :id="expandedRowDomId(row.id)"
                      >
                        <td
                          :colspan="
                            row.getVisibleCells().length + leadingCellCount
                          "
                          :class="uiTable.expandedCell()"
                        >
                          <div :class="uiTable.expandedBody()">
                            <slot name="expanded" :row="row" />
                          </div>
                        </td>
                      </tr>
                    </template>
                  </template>
                </template>
                <!-- First load: skeleton rows keep the column rhythm instead of
                flashing the empty state. -->
                <template v-else-if="isFirstPageLoading">
                  <tr
                    v-for="rowIndex in skeletonRowCount"
                    :key="`skeleton-${rowIndex}`"
                    aria-hidden="true"
                    :class="uiTable.skeletonRow()"
                    :style="{ opacity: skeletonRowOpacity(rowIndex) }"
                  >
                    <td
                      v-if="hasPresenceRail"
                      class="border-b-muted border-b p-0 in-[tr:last-child]:border-b-0"
                    />
                    <td v-if="reorder" :class="uiTable.handleCell()" />
                    <td
                      v-for="(
                        column, columnIndex
                      ) in table.getVisibleLeafColumns()"
                      :key="column.id"
                      :class="uiTable.rowCell()"
                    >
                      <USkeleton
                        :aria-label="t('dms.a11y.loading')"
                        v-if="column.columnDef.meta"
                        :class="uiTable.skeletonCell()"
                        :style="{ width: skeletonWidth(rowIndex, columnIndex) }"
                      />
                    </td>
                  </tr>
                </template>
                <tr v-else>
                  <td
                    :colspan="
                      table.getVisibleLeafColumns().length + leadingCellCount
                    "
                    class="p-0"
                  >
                    <div :class="uiTable.emptyBody()">
                      <TableEmpty
                        :can-add-row="
                          normalizeActionConfig(rowActions?.add).isEnabled
                        "
                        :load-error="loadError"
                        :archived="isShowingArchived"
                        :empty-states="emptyStates"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <span
          v-if="scrollEdges.start"
          aria-hidden="true"
          data-table-scroll-fade="start"
          :class="uiTable.scrollFade({ side: 'start' })"
          :style="{ insetInlineStart: `${scrollFadeInsets.start}px` }"
        />
        <span
          v-if="scrollEdges.end"
          aria-hidden="true"
          data-table-scroll-fade="end"
          :class="uiTable.scrollFade({ side: 'end' })"
          :style="{ insetInlineEnd: `${scrollFadeInsets.end}px` }"
        />
      </div>

      <TablePagination />
    </slot>
  </div>
</template>
