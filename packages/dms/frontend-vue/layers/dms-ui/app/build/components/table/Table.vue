<script lang="ts">
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
import type { LabeledColumn } from "../../composables/table/useTableColumns";
import {
  defaultSortingState,
  type SortValueKind,
} from "../../composables/table-view/utils/sortableColumns";
import type {
  CustomButton,
  TableViewDisplayCapabilities,
} from "../../../composables/table-view/types";
import type {
  FormContainer,
  FormPageUrls,
} from "../../composables/table-view/useTableViewConfig";
import type { CustomRowAction } from "../../../types/row-action";
import type { RowActionConfig } from "#dms-core/app/types/row-action";
import type { TableTabItem } from "./Tabs.vue";
import type { ColumnDisplay } from "../../composables/data-types/useColumnValueRenderer";
import type { ResolvedTableChrome } from "../../composables/table-view/utils/chrome";
import type { ResolvedQuickFilter } from "../../composables/table-view/utils/quickFilters";
import type { ClearableTableFilters } from "../../composables/table/utils/clearTableFilters";
import type { EventHookOn } from "@vueuse/core";

export interface Data {
  [key: string]: unknown;
}

export type TableDensity = "default" | "compact";

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
  rowActions?: TableRowActionOptions;
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
   * among `kanbanGroupByOptions`.
   */
  displays?: TableViewSwitcherItem[];
  kanbanGroupByOptions?: KanbanGroupByOption[];
  /** Chrome capabilities of the active display; gates filters/search/sort/columns. */
  activeCapabilities?: Required<TableViewDisplayCapabilities>;

  /**
   * Archive mode: shows the "Archived" toolbar toggle (bound to the
   * `showArchived` model). While on, the table lists archived rows under an
   * amber strip and swaps the row and bulk actions to restore.
   */
  archiveToggle?: boolean;
  /** Row height: `compact` gives 36px rows under a 32px header band. */
  density?: TableDensity;
  /**
   * Controls drawn around the rows (the resolved backend `chrome`). Defaults
   * to the full chrome.
   */
  chrome?: ResolvedTableChrome;
  /** Placeholder of the search field. */
  searchPlaceholder?: string;
  /**
   * One-click dropdown filters of the toolbar, their picked values bound to
   * the `quickFilterValues` model.
   */
  quickFilters?: ResolvedQuickFilter[];
  /** Footer texts: the row count (i18n key receiving `{ count }`) and a hint. */
  footer?: TableFooterTexts;
  /**
   * Keeps the header band visible while the rows scroll. Takes effect with
   * `maxHeight`, which caps the scroll area (any CSS length).
   */
  stickyHeader?: boolean;
  maxHeight?: string;

  data?: T[] | null;
  columns?: TableColumn<T>[];
  loading?: boolean;
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
}

export interface TableEmits<T> {
  (e: "add" | "refresh"): void;
  (e: "details" | "edit", item: T): void;
  (e: "delete" | "archive" | "restore" | "export", itemIds: string[]): void;
  (e: "duplicate", itemId: string): void;
}

export interface TableFilter {
  accessorKey: string;
  value?: unknown | unknown[];
  mode: string;
  pinned?: boolean;
  initialValue?: unknown | unknown[];
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
  /**
   * Clears everything that narrows the rows — filter chips, the toolbar
   * search, quick filters — and goes back to the first page.
   */
  resetFilters: () => void;
  /** What `resetFilters` would clear (nothing: no clear action to offer). */
  clearableFilters: ComputedRef<ClearableTableFilters>;
  /** A search, a filter chip or a quick filter narrows the rows. */
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
  showArchivedState: ModelRef<boolean>;
  chrome: ComputedRef<ResolvedTableChrome>;
  footer?: TableFooterTexts;
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
import {
  clearTableFilters,
  clearableTableFilters,
  isTableNarrowed,
  type TableNarrowingState,
} from "../../composables/table/utils/clearTableFilters";
import {
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_SIZE,
} from "../../composables/table/constants";

// Same color as the surrounding card frame (.dms-card) so sticky
// rail/pinned cells blend in instead of showing a contrasting block.
const PANEL_MATCH_BG = "bg-(--dms-surface-card)";

// Header cells sit on the v2 band color; sticky header cells need the same
// opaque background as the non-sticky ones.
const HEADER_MATCH_BG = "bg-(--dms-bg-muted)";

// Sticky cells paint their own opaque background over the row's, so they have
// to repeat the hover tint under the exact same condition as the row itself;
// otherwise only the pinned column lights up.
const ROW_HOVER_BG = "hover:bg-elevated";
const ROW_HOVER_CELL_BG = "group-hover:bg-elevated";

// A selected row is tinted with the accent; sticky cells need an opaque mix of
// the same tint so scrolled content never shows through them.
const ROW_SELECTED_BG = "data-[selected=true]:bg-primary/10";
const ROW_SELECTED_CELL_BG =
  "group-data-[selected=true]:bg-[color-mix(in_srgb,var(--ui-primary)_10%,var(--dms-surface-card))]";

// An expanded row keeps the hover tint and hands its bottom rule to the detail
// band below it.
const ROW_EXPANDED_BG = "data-[expanded=true]:bg-elevated";
const ROW_EXPANDED_CELL_BG = "group-data-[expanded=true]:bg-elevated";

// Sticky header: the band gains a soft shadow once the body scrolls under it.
const HEADER_SCROLL_SHADOW =
  "shadow-[0_8px_10px_-8px_color-mix(in_srgb,var(--ui-border-accented)_90%,transparent)]";

// The v2 bands start 18px from the card edge. The first data cell carries that
// gutter; after the 2px presence rail (an empty first cell) it takes the rest.
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

    tableRoot: "relative overflow-x-auto whitespace-nowrap",
    tableBase: "inline-block min-w-full align-middle",
    table: "text-default w-full min-w-full table-fixed text-left text-[13px]/5",
    tableCaption: "sr-only",

    // 2px indeterminate bar riding the bottom edge of the header band.
    loadingBar:
      "pointer-events-none absolute inset-x-0 top-9 z-40 h-0.5 overflow-hidden",
    loadingBarIndicator:
      "absolute inset-y-0 start-0 w-1/2 rounded-full bg-(--dms-accent-fill) animate-[carousel_1.3s_ease-in-out_infinite]",
    skeletonRow: "pointer-events-none",
    skeletonCell: "block h-2.5 rounded-md",

    // Archive mode: an amber strip under the chrome while archived rows show.
    archiveStrip:
      "flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-(--dms-warning-line) bg-(--dms-warning-tint) py-[9px] ps-[18px] pe-3.5 text-[13px] text-highlighted",
    archiveStripIcon: "size-[17px] shrink-0 text-warning",
    archiveStripText: "min-w-0",
    archiveStripTitle: "font-semibold",
    archiveStripDescription: "text-[12.5px] text-muted",
    archiveStripAction: "ms-auto",

    // Detail band of an expanded row, on the muted surface and indented to
    // the content column.
    expandedCell:
      "border-b border-default bg-(--dms-bg-muted) p-0 whitespace-normal in-[tr:last-child]:border-b-0",
    // The band sticks to the visible part of a horizontally scrolled table
    // (its width is the scroll area's, --dms-table-viewport), so the detail
    // never hides past the card edge. Phones drop the content-column indent.
    expandedBody:
      "sticky start-0 w-[var(--dms-table-viewport,auto)] pt-4 pb-[18px] pe-[18px] ps-[18px] sm:ps-[68px]",

    headCell: `${HEADER_MATCH_BG} ${FIRST_HEAD_CELL_GUTTER} border-b-default text-dimmed group relative touch-none select-none overflow-hidden border-b h-9 px-3.5 py-0 font-mono text-[10.5px] font-semibold tracking-[0.12em] uppercase last:pe-2.5`,
    headCellInternal: "flex w-full items-center justify-between gap-1",
    colOptionsTrigger: "opacity-0 transition-opacity group-hover:opacity-100",
    colResizer:
      "bg-primary/40 absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none select-none opacity-0 hover:opacity-100",

    row: `group ${ROW_SELECTED_BG} ${ROW_EXPANDED_BG}`,
    rowCell: `${FIRST_ROW_CELL_GUTTER} border-b-muted border-b h-11 px-3.5 py-0 text-[13px] last:pe-2.5 in-[tr:last-child]:border-b-0 group-data-[expanded=true]:border-b-transparent`,
    rowInternal: "transition-opacity duration-150",
    rowContainer: "relative",
    rowSpan: "line-clamp-1 text-ellipsis",

    // The row checkbox and the row actions (the … menu and every other icon
    // of the last column) stay visible but faded, and come to full strength
    // when the row is hovered, selected, focused or one of its menus is open.
    rowSelection:
      "opacity-40 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
    rowAction:
      "flex items-center justify-end gap-1 opacity-40 transition-opacity group-hover:opacity-100 group-data-[selected=true]:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100",

    columnActiveSortIcon: "size-3 shrink-0 text-primary",
  },
  variants: {
    cellWrap: {
      true: {
        rowSpan: "line-clamp-none whitespace-normal [overflow-wrap:anywhere]",
      },
    },
    // The header sits straight on the column band when no tabs row follows
    // it, and then carries the rule itself.
    headerDivided: {
      true: {
        header: "border-b border-default",
      },
    },
    // Tabs up in the header band (no caption): they take its full height and
    // their underline lands on its bottom rule.
    tabsInline: {
      true: {
        header: "min-h-11 py-0",
      },
    },
    pinned: {
      left: {
        headCell: `${HEADER_MATCH_BG} sticky z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]`,
        rowCell: `${PANEL_MATCH_BG} ${ROW_SELECTED_CELL_BG} ${ROW_EXPANDED_CELL_BG} group-data-[presence=true]:bg-elevated sticky z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]`,
      },
      right: {
        headCell: `${HEADER_MATCH_BG} sticky z-10 shadow-[-2px_0_0_0_rgba(0,0,0,0.06)]`,
        rowCell: `${PANEL_MATCH_BG} ${ROW_SELECTED_CELL_BG} ${ROW_EXPANDED_CELL_BG} group-data-[presence=true]:bg-elevated sticky z-10 shadow-[-2px_0_0_0_rgba(0,0,0,0.06)]`,
      },
    },
    // Dense lists: 36px rows under a 32px header band.
    density: {
      default: "",
      compact: {
        headCell: "h-8",
        rowCell: "h-9 text-[12.5px]",
        loadingBar: "top-8",
      },
    },
    // The header band sticks to the top of a height-capped scroll area.
    stickyHeader: {
      true: {
        tableRoot: "overflow-y-auto overscroll-contain",
        table: "border-separate border-spacing-0",
        headCell: "sticky top-0 z-20",
      },
    },
    scrolled: {
      true: "",
    },
    // Rows listed while viewing the archive read as set aside.
    // Restore stays on show there, it is the only thing to do with them.
    archived: {
      true: {
        rowCell: "text-muted",
        rowAction: "opacity-100",
      },
    },
    // A re-fetch keeps the rows on show, faded once it lasts (the delay
    // spares quick ones a flicker), under the header band's loading bar.
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
    // Labelled inline actions are the row's actions on show: never faded.
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
      stickyHeader: true,
      pinned: ["left", "right"],
      class: {
        headCell: "z-30",
      },
    },
    {
      stickyHeader: true,
      scrolled: true,
      class: {
        headCell: HEADER_SCROLL_SHADOW,
      },
    },
  ],
});

// Grid-like default for standalone use; TableView always passes the active
// display's resolved capabilities.
const DEFAULT_CAPABILITIES = resolveDisplayCapabilities({
  columnManagement: true,
});

const props = defineProps<TableProps<T>>();
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
const expandedState = defineModel<ExpandedState>("expanded", {
  default: (): ExpandedState => ({}),
});
const showArchivedState = defineModel<boolean>("showArchived", {
  default: false,
});
const quickFilterValuesState = defineModel<Record<string, string | undefined>>(
  "quickFilterValues",
  { default: (): Record<string, string | undefined> => ({}) },
);

const slots = useSlots();
// A detail renderer turns the expander column on.
const isExpandable = !!slots.expanded;
// The caret button names the detail row it opens (aria-controls).
const tableDomId = `dms-table-${useId()}`;
const expandedRowDomId = (rowId: string): string =>
  `${tableDomId}-detail-${rowId.replace(/\s+/g, "_")}`;

// Rows are archived ones only while the toggle is on.
const isShowingArchived = computed(
  () => !!props.archiveToggle && showArchivedState.value,
);

// As many placeholder rows as the page will list (capped), fading out.
const SKELETON_MAX_ROW_COUNT = 10;
const SKELETON_TOTAL_FADE = 0.7;
const SKELETON_WIDTHS = ["62%", "48%", "70%", "54%", "40%"];
const skeletonWidth = (rowIndex: number, columnIndex: number): string =>
  SKELETON_WIDTHS[(rowIndex + columnIndex) % SKELETON_WIDTHS.length]!;

// The scroll shadow under a sticky header only shows once rows went under it.
const isScrolled = ref(false);
const onTableScroll = (event: Event) => {
  if (!props.stickyHeader) return;
  isScrolled.value = (event.target as HTMLElement).scrollTop > 0;
};
// Expanded detail bands are as wide as the visible scroll area.
const tableRootRef = useTemplateRef<HTMLElement>("tableRoot");
const { width: tableViewportWidth } = useElementSize(tableRootRef);
const tableRootStyle = computed(() => ({
  maxHeight:
    props.stickyHeader && props.maxHeight ? props.maxHeight : undefined,
  "--dms-table-viewport":
    isExpandable && tableViewportWidth.value > 0
      ? `${tableViewportWidth.value}px`
      : undefined,
}));

// A clipped cell value reads in full in a native tooltip.
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

// The first page is on its way: skeleton rows (and placeholders for the
// counts) hold the list's place instead of its empty state.
const isFirstPageLoading = computed(
  () => !!props.loading && !props.data?.length,
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
// Someone else editing the row is the violet (AI/collaboration) accent; a row
// selected here is the cyan one.
const PRESENCE_RAIL_ACTIVE_BG = "bg-secondary";
const SELECTION_RAIL_BG = "bg-primary";

const hasPresenceRail = computed(() => props.presenceByRow !== undefined);

// Pinned columns stick only while they cover at most 60% of the visible scroll
// area: on a phone, labelled row actions or a wide pinned set would otherwise
// hide every column scrolling under them. The wider side lets go first.
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

// A scrolling column is never wider than the room the sticky columns leave
// (a 300px identity column on a phone): its content truncates in view
// instead of running under the pinned actions.
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

// Only a header the list can be sorted on states its order to assistive
// technologies; the others carry no `aria-sort` at all.
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
    density: props.density ?? "default",
    stickyHeader: !!props.stickyHeader,
    scrolled: isScrolled.value,
    archived: isShowingArchived.value,
  }),
);

const { table, labeledColumns, deleteFilter, deleteSorting } = useTable<T>({
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

const { t, locale } = useI18n();

const formattedRowCount = computed(() =>
  new Intl.NumberFormat(locale.value).format(rowCount.value),
);

const captionCountLabel = computed(() =>
  isShowingArchived.value
    ? t("dms.table.archived_count", { count: formattedRowCount.value })
    : formattedRowCount.value,
);

const hasTabs = computed(() => (props.tabs?.length ?? 0) > 0);

const resolvedChrome = computed<ResolvedTableChrome>(
  () => props.chrome ?? FULL_TABLE_CHROME,
);
// Without a caption, the tabs move up into the header band.
const tabsInline = computed(
  () => hasTabs.value && !resolvedChrome.value.caption,
);
// A hidden custom button stays pressable by id (quick action, header action).
const toolbarButtons = computed(() =>
  (props.customButtons ?? []).filter((button) => !button.hidden),
);

// The bulk bar shows whenever selected rows have something to go to.
const hasBulkActions = computed(
  () =>
    normalizeActionConfig(props.rowActions?.delete).isEnabled ||
    normalizeActionConfig(props.rowActions?.archive).isEnabled ||
    normalizeActionConfig(props.rowActions?.restore).isEnabled ||
    !!props.canExport,
);

// Defined once (stable ref identity) so consumers that capture tableSharedData
// by value (e.g. Actions.vue via useTableContext) still react when the active
// display — and thus its capabilities — changes.
const resolvedCapabilities = computed<Required<TableViewDisplayCapabilities>>(
  () => props.activeCapabilities ?? DEFAULT_CAPABILITIES,
);

// The single "clear all" of the table: every clear action goes through it.
const narrowingState: TableNarrowingState = {
  columnFilters: columnFiltersState,
  globalFilter: globalFilterState,
  quickFilterValues: quickFilterValuesState,
  pagination: paginationState,
  searchApplies: computed(() => resolvedCapabilities.value.search),
};
const filtersCleared = createEventHook();
const resetFilters = () => {
  clearTableFilters(narrowingState);
  void filtersCleared.trigger();
};
const clearableFilters = computed(() => clearableTableFilters(narrowingState));
const isFiltered = computed(() => isTableNarrowed(narrowingState));

const baselineColumnOrder = [...columnOrderState.value];
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

const areArraysEqual = (a: unknown[], b: unknown[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
};

const arePinningEqual = (
  a: ColumnPinningState,
  b: ColumnPinningState,
): boolean => {
  return (
    areArraysEqual(a.left ?? [], b.left ?? []) &&
    areArraysEqual(a.right ?? [], b.right ?? [])
  );
};

const hasCustomColumns = computed(() => {
  if (!areArraysEqual(columnOrderState.value, baselineColumnOrder)) return true;
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
    resetFilters,
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
    showArchivedState,
    chrome: resolvedChrome,
    footer: props.footer,
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

// The hover tint and the double-click read the same resolution, so a row that
// lights up always opens something.
const isRowClickable = (row: T): boolean => rowClickAction(row) !== undefined;

const handleRowDoubleClick = (row: T) => {
  const action = rowClickAction(row);
  if (!action) return;
  if (typeof action === "string") {
    emits(action, row);
    return;
  }
  props.onCustomRowAction?.(action, row);
};

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
  <div :class="uiTable.root()">
    <template v-if="resolvedCapabilities.header">
      <header
        :class="
          uiTable.header({
            headerDivided: !hasTabs || tabsInline,
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
            v-if="isFirstPageLoading"
            aria-hidden="true"
            :class="uiTable.captionCountPlaceholder()"
          />
          <span v-else-if="rowCount > 0" :class="uiTable.captionCount()">
            {{ captionCountLabel }}
          </span>
        </h2>

        <TableActions
          v-model:global-filter="globalFilterState"
          v-model:column-visibility="columnVisibilityState"
          v-model:sorting="sortingState"
          v-model:show-archived="showArchivedState"
          v-model:quick-filter-values="quickFilterValuesState"
          :table
          :can-add-row="normalizeActionConfig(rowActions?.add).isEnabled"
          :archive-toggle="archiveToggle"
          :custom-buttons="toolbarButtons"
          :on-custom-button="onCustomButton"
          :chrome="resolvedChrome"
          :search-placeholder="searchPlaceholder"
          :quick-filters="quickFilters"
          :class="{
            'ms-auto': !resolvedChrome.caption && !tabsInline,
            'py-2': tabsInline,
          }"
        />
      </header>

      <TableTabs
        v-if="hasTabs && tabs && !tabsInline"
        v-model="activeTabId"
        :tabs="tabs"
      />

      <TableFiltersRow
        v-if="
          filtersRowOpen &&
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
        :row-actions="rowActions"
        :can-export="canExport"
        :archived="isShowingArchived"
      />
    </template>

    <slot name="body" :table="table">
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

        <div :class="uiTable.tableBase()">
          <table :class="uiTable.table()">
            <caption v-if="caption" :class="uiTable.tableCaption()">
              {{ caption }}
            </caption>

            <thead>
              <tr
                v-for="headerGroup in table.getHeaderGroups()"
                :key="headerGroup.id"
              >
                <th
                  v-if="hasPresenceRail"
                  :class="[
                    HEADER_MATCH_BG,
                    'border-b-default sticky left-0 z-30 border-b p-0',
                    stickyHeader && 'top-0 z-40',
                  ]"
                  :style="{
                    width: PRESENCE_RAIL_WIDTH_PX,
                    minWidth: PRESENCE_RAIL_WIDTH_PX,
                  }"
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
                <template v-for="row in table.getRowModel().rows" :key="row.id">
                  <tr
                    :data-selected="row.getIsSelected()"
                    :data-expanded="row.getIsExpanded()"
                    :data-presence="!!getRowPresence(row.original)"
                    :title="
                      getRowPresence(row.original)
                        ? presenceTooltipText(getRowPresence(row.original)!)
                        : undefined
                    "
                    :class="
                      uiTable.row({
                        loading,
                        rowClickable: isRowClickable(row.original),
                        presence: !!getRowPresence(row.original),
                      })
                    "
                    @dblclick="handleRowDoubleClick(row.original)"
                    @mouseenter="handleRowHover(row)"
                    @mouseleave="handleRowLeave"
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
                    <td
                      v-for="cell in row.getVisibleCells()"
                      :key="cell.id"
                      :data-pinned="cell.column.getIsPinned()"
                      :class="
                        uiTable.rowCell({
                          pinned: getPinnedVariant(cell.column),
                          loading,
                          rowClickable: isRowClickable(row.original),
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
                  <tr v-if="row.getIsExpanded()" :id="expandedRowDomId(row.id)">
                    <td
                      :colspan="
                        row.getVisibleCells().length + (hasPresenceRail ? 1 : 0)
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
              <!-- First load: skeleton rows keep the column rhythm instead of
                flashing the empty state. -->
              <template v-else-if="loading">
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
                  <td
                    v-for="(
                      column, columnIndex
                    ) in table.getVisibleLeafColumns()"
                    :key="column.id"
                    :class="uiTable.rowCell()"
                  >
                    <USkeleton
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
                    table.getVisibleLeafColumns().length +
                    (hasPresenceRail ? 1 : 0)
                  "
                  class="p-0"
                >
                  <TableEmpty
                    :can-add-row="
                      normalizeActionConfig(rowActions?.add).isEnabled
                    "
                    :load-error="loadError"
                    :archived="isShowingArchived"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <TablePagination />
    </slot>
  </div>
</template>
