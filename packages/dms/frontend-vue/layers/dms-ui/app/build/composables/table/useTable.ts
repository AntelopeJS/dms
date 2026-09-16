import type { ModelRef } from "vue";
import type {
  Data,
  TableEmits,
  TableFilter,
  TableProps,
} from "../../components/table/Table.vue";
import {
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useVueTable,
  type ColumnPinningState,
  type ColumnSizingState,
  type ExpandedState,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/vue-table";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import {
  useTableColumns,
  type LabeledColumn,
  type TableStyleSlots,
} from "./useTableColumns";
import { useTableStates } from "./useTableStates";
import type { TableColumnMeta } from "./types";
import {
  ALWAYS_PINNED_LEFT_COLUMN_IDS,
  ALWAYS_PINNED_RIGHT_COLUMN_IDS,
} from "./constants";

const DEFAULT_ROW_ID_KEY = "_id";

const filterAvailableIds = (ids: string[], columns: { id?: string }[]) =>
  ids.filter((id) => columns.some((col) => col.id === id));

const buildPinnedSide = (forcedIds: string[], existing: string[]) =>
  forcedIds.length === 0
    ? existing
    : [...forcedIds, ...existing.filter((id) => !forcedIds.includes(id))];

const applyAlwaysPinned = (
  pinningState: ModelRef<ColumnPinningState>,
  columns: { id?: string }[],
) => {
  const leftIds = filterAvailableIds(ALWAYS_PINNED_LEFT_COLUMN_IDS, columns);
  const rightIds = filterAvailableIds(ALWAYS_PINNED_RIGHT_COLUMN_IDS, columns);
  if (leftIds.length === 0 && rightIds.length === 0) return;

  pinningState.value = {
    left: buildPinnedSide(leftIds, pinningState.value.left ?? []),
    right: buildPinnedSide(rightIds, pinningState.value.right ?? []),
  };
};

interface UseTableProps<T> {
  tableProps: TableProps<T>;
  emits: TableEmits<T>;
  states: {
    globalFilterState: ModelRef<string>;
    columnFiltersState: ModelRef<TableFilter[]>;
    columnOrderState: ModelRef<string[]>;
    columnVisibilityState: ModelRef<VisibilityState>;
    columnPinningState: ModelRef<ColumnPinningState>;
    columnSizingState: ModelRef<ColumnSizingState>;
    rowSelectionState: ModelRef<RowSelectionState>;
    sortingState: ModelRef<SortingState>;
    expandedState: ModelRef<ExpandedState>;
    paginationState: ModelRef<PaginationState>;
  };
  ui: ComputedRef<TableStyleSlots>;
}

export const useTable = <T extends Data>(props: UseTableProps<T>) => {
  const { emits, states } = props;
  const { rowActions } = props.tableProps;
  const rowIdKey = props.tableProps.rowIdKey ?? DEFAULT_ROW_ID_KEY;

  const tableData = computed(() => props.tableProps.data ?? []);

  const { columns } = useTableColumns<T>({
    data: tableData,
    columns: props.tableProps.columns,
    rowIdKey,
    rowActions,
    canExport: props.tableProps.canExport,
    emits,
    ui: props.ui,
    componentId: props.tableProps.componentId,
    formContainer: props.tableProps.formContainer,
    onCustomRowAction: props.tableProps.onCustomRowAction,
  });

  states.columnOrderState.value = columns.value
    .map((x) => x.id ?? "")
    .filter(Boolean);

  watchEffect(() =>
    applyAlwaysPinned(states.columnPinningState, columns.value),
  );

  const {
    deleteFilter,
    resetFilters,
    deleteSorting,
    stateHandlers,
    stateGetters,
  } = useTableStates(states);

  const isManualFiltering =
    props.tableProps.columnFiltersOptions?.manualFiltering;
  const isManualSorting = props.tableProps.sortingOptions?.manualSorting;

  const tableConfig = shallowRef({
    data: tableData,
    columns: columns.value,

    ...stateHandlers,

    ...(props.tableProps.globalFilterOptions || {}),
    ...(props.tableProps.orderOptions || {}),
    ...(props.tableProps.columnFiltersOptions || {}),
    getFilteredRowModel: isManualFiltering ? undefined : getFilteredRowModel(),

    ...(props.tableProps.rowSelectionOptions || {}),

    ...(props.tableProps.sortingOptions || {}),
    getSortedRowModel: isManualSorting ? undefined : getSortedRowModel(),

    ...(props.tableProps.expandedOptions || {}),
    getExpandedRowModel: getExpandedRowModel(),

    ...(props.tableProps.paginationOptions || {}),
    getPaginationRowModel: getPaginationRowModel(),

    columnResizeMode: "onChange" as const,
    ...(props.tableProps.sizingOptions || {}),

    state: stateGetters,

    getRowId: (row: unknown) => get(row as Record<string, unknown>, rowIdKey),

    getCoreRowModel: getCoreRowModel(),
  });

  const table = useVueTable(tableConfig.value);

  watch(
    () => props.tableProps.paginationOptions?.rowCount,
    (newRowCount) => {
      table.setOptions((prev) => ({
        ...prev,
        rowCount: newRowCount,
      }));
    },
  );

  const labeledColumns: ComputedRef<LabeledColumn<T>[]> = computed(() => {
    return table
      .getAllColumns()
      .map((col) => ({
        label: (col.columnDef.meta as TableColumnMeta)?.label,
        column: col,
      }))
      .filter((col) => col.label) as LabeledColumn<T>[];
  });

  return {
    table,
    data: tableData,
    columns,
    labeledColumns,
    deleteFilter,
    resetFilters,
    deleteSorting,
  };
};
