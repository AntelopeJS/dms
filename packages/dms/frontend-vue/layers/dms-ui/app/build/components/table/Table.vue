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
import type {
  CustomButton,
  TableViewDisplayCapabilities,
} from "../../../composables/table-view/types";
import type { FormContainer } from "../../composables/table-view/useTableViewConfig";
import type { CustomRowAction } from "../../../types/row-action";
import type { RowActionConfig } from "#dms-core/app/types/row-action";
import type { TableTabItem } from "./Tabs.vue";

export interface Data {
  [key: string]: unknown;
}

export type TableColumn<T> = ColumnDef<T> & {
  type?: DataTypeConfig;
  /** Wrap the default cell renderer without clipping; custom cell slots own their layout. */
  cellWrap?: boolean;
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
  defaultSort?: { field: string; desc?: boolean };
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
  hasCustomColumns: ComputedRef<boolean>;
  deleteFilter: (index: number) => void;
  resetFilters: () => void;
  deleteSorting: (index: number) => void;
  rowCount: number;
  displays: TableViewSwitcherItem[];
  hasDisplaySwitcher: boolean;
  activeDisplayState: ModelRef<string>;
  activeCapabilities: ComputedRef<Required<TableViewDisplayCapabilities>>;
  kanbanGroupByState: ModelRef<string>;
  kanbanGroupByOptions: KanbanGroupByOption[];
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
  watchEffect,
} from "vue";
import { provideLocal } from "@vueuse/core";
import { tv } from "tailwind-variants";
import { get } from "@nuxt/ui/runtime/utils/index.js";

import TableActions from "./Actions.vue";
import TableEmpty from "./Empty.vue";
import TablePagination from "./Pagination.vue";
import TableFiltersRow from "./FiltersRow.vue";
import TableRowSelection from "./RowSelection.vue";
import TableTabs from "./Tabs.vue";
import { createTableViewDeleteShortcut } from "../../../composables/table-view/shortcuts/tableViewDelete";
import {
  DEFAULT_PAGE_INDEX,
  DEFAULT_PAGE_SIZE,
} from "../../composables/table/constants";

// Same color as the surrounding card frame (.dms-card) so sticky
// rail/pinned cells blend in instead of showing a contrasting block.
const PANEL_MATCH_BG = "bg-(--dms-surface-card)";

// Header cells sit on the muted header band; sticky header cells need the
// same opaque background as the non-sticky ones.
const HEADER_MATCH_BG = "bg-muted dark:bg-accented";

// Sticky cells paint their own opaque background over the row's, so they have
// to repeat the hover tint under the exact same condition as the row itself;
// otherwise only the pinned column lights up.
const ROW_HOVER_BG = "hover:bg-elevated dark:hover:bg-accented";
const ROW_HOVER_CELL_BG =
  "group-hover:bg-elevated dark:group-hover:bg-accented";

const theme = tv({
  slots: {
    root: "dms-card flow-root p-4 sm:p-6",
    header: "flex justify-between",
    caption: "text-lg md:text-xl font-semibold truncate",

    tableRoot:
      "border-default mt-4 overflow-x-auto rounded-lg border whitespace-nowrap",
    tableBase: "inline-block min-w-full align-middle",
    table: "text-default w-full min-w-full table-fixed text-left text-sm/6",
    tableCaption: "sr-only",

    headCell: `${HEADER_MATCH_BG} border-b-default text-muted group relative touch-none select-none overflow-hidden border-b px-4 py-3 text-xs font-semibold`,
    headCellInternal: "flex w-full items-center justify-between",
    colOptionsTrigger: "opacity-0 transition-opacity group-hover:opacity-100",
    colResizer:
      "bg-primary/40 absolute right-0 top-0 z-10 h-full w-1 cursor-col-resize touch-none select-none opacity-0 hover:opacity-100",

    row: "group",
    rowCell:
      "border-b-muted border-b px-4 py-3.5 text-sm in-[tr:last-child]:border-b-0",
    rowInternal: "",
    rowContainer: "relative",
    rowSpan: "line-clamp-1",

    rowSelection: "opacity-0 transition-opacity group-hover:opacity-100",
    rowAction: "flex items-center justify-end gap-1",

    columnActiveSortIcon: "size-4",

    skeletonTd: "absolute inset-px",
  },
  variants: {
    cellWrap: {
      true: {
        rowSpan: "line-clamp-none whitespace-normal [overflow-wrap:anywhere]",
      },
    },
    pinned: {
      left: {
        headCell: `${HEADER_MATCH_BG} sticky z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]`,
        rowCell: `${PANEL_MATCH_BG} group-data-[presence=true]:bg-elevated dark:group-data-[presence=true]:bg-accented sticky z-10 shadow-[2px_0_0_0_rgba(0,0,0,0.06)]`,
      },
      right: {
        headCell: `${HEADER_MATCH_BG} sticky z-10 shadow-[-2px_0_0_0_rgba(0,0,0,0.06)]`,
        rowCell: `${PANEL_MATCH_BG} group-data-[presence=true]:bg-elevated dark:group-data-[presence=true]:bg-accented sticky z-10 shadow-[-2px_0_0_0_rgba(0,0,0,0.06)]`,
      },
    },
    loading: {
      true: {
        row: "cursor-wait hover:bg-transparent",
        rowInternal: "opacity-0",
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
    presence: {
      true: {
        row: "opacity-70 bg-elevated dark:bg-accented",
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
const paginationState = defineModel<PaginationState>("pagination", {
  default: (): PaginationState => ({
    pageIndex: DEFAULT_PAGE_INDEX,
    pageSize: DEFAULT_PAGE_SIZE,
  }),
});

const onResize = (
  event: MouseEvent | TouchEvent,
  header: Header<T, unknown>,
) => {
  header.getResizeHandler()?.(event);
};

const PRESENCE_RAIL_WIDTH = 2;
const PRESENCE_RAIL_WIDTH_PX = `${PRESENCE_RAIL_WIDTH}px`;
const PRESENCE_RAIL_ACTIVE_BG = "bg-primary";

const hasPresenceRail = computed(() => props.presenceByRow !== undefined);

const getPinnedLeftOffset = (column: {
  getIsPinned: () => unknown;
  getStart: (pos: "left") => number;
}) => {
  if (column.getIsPinned() !== "left") return undefined;
  const base = column.getStart("left");
  const rail = hasPresenceRail.value ? PRESENCE_RAIL_WIDTH : 0;
  return `${base + rail}px`;
};

const getPinnedRightOffset = (column: {
  getIsPinned: () => unknown;
  getAfter: (pos: "right") => number;
}) => {
  if (column.getIsPinned() !== "right") return undefined;
  return `${column.getAfter("right")}px`;
};

const getPinnedVariant = (column: { getIsPinned: () => unknown }) => {
  const pinned = column.getIsPinned();
  return pinned === "left" || pinned === "right" ? pinned : undefined;
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
const uiTable = computed(() => uiTableRoot());

const { table, labeledColumns, deleteFilter, resetFilters, deleteSorting } =
  useTable<T>({
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
  });

const rowCount = computed(() => props.paginationOptions?.rowCount ?? 0);

// Defined once (stable ref identity) so consumers that capture tableSharedData
// by value (e.g. Actions.vue via useTableContext) still react when the active
// display — and thus its capabilities — changes.
const resolvedCapabilities = computed<Required<TableViewDisplayCapabilities>>(
  () => props.activeCapabilities ?? DEFAULT_CAPABILITIES,
);

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
    hasCustomColumns,
    deleteFilter,
    resetFilters,
    deleteSorting,
    rowCount: rowCount.value,
    displays: props.displays || [],
    hasDisplaySwitcher: (props.displays?.length ?? 0) > 1,
    activeDisplayState,
    activeCapabilities: resolvedCapabilities,
    kanbanGroupByState,
    kanbanGroupByOptions: props.kanbanGroupByOptions || [],
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

const { t } = useI18n();

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
    <header :class="uiTable.header()">
      <h2 :class="uiTable.caption()">
        {{ caption }}
      </h2>

      <TableActions
        v-model:global-filter="globalFilterState"
        v-model:column-visibility="columnVisibilityState"
        v-model:sorting="sortingState"
        :table
        :can-add-row="normalizeActionConfig(rowActions?.add).isEnabled"
        :custom-buttons="customButtons"
        :on-custom-button="onCustomButton"
      />
    </header>

    <TableTabs
      v-if="tabs && tabs.length > 0"
      v-model="activeTabId"
      :tabs="tabs"
    />

    <TableFiltersRow v-if="filtersRowOpen && resolvedCapabilities.filters" />

    <TableRowSelection
      v-if="rowActions?.delete || canExport"
      v-model:row-selection="rowSelectionState"
      :row-actions="rowActions"
      :can-export="canExport"
    />

    <slot name="body" :table="table">
      <section :class="uiTable.tableRoot()">
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
                  :data-pinned="header.column.getIsPinned()"
                  :class="
                    uiTable.headCell({
                      pinned: getPinnedVariant(header.column),
                    })
                  "
                  :style="{
                    width: header.getSize() + 'px',
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
                        presenceRailBackground(row.original),
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
                            >
                              <FlexRender
                                :render="cell.column.columnDef.cell"
                                :props="cell.getContext()"
                              />
                            </div>
                          </slot>
                        </div>

                        <USkeleton
                          v-show="loading"
                          :class="uiTable.skeletonTd()"
                        />
                      </div>
                    </td>
                  </tr>
                  <tr v-if="row.getIsExpanded()">
                    <td
                      :colspan="
                        row.getAllCells().length + (hasPresenceRail ? 1 : 0)
                      "
                    >
                      <slot name="expanded" :row="row" />
                    </td>
                  </tr>
                </template>
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
