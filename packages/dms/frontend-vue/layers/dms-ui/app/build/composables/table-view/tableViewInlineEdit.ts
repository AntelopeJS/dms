import { describeTableWriteError } from "./utils/writeError";
import { useTableInlineEdit } from "./useTableInlineEdit";
import type { TableViewScope } from "./tableViewScope";

export function useTableViewInlineEdit<T extends Data>(
  scope: Pick<
    TableViewScope<T>,
    | "configuration"
    | "listState"
    | "rows"
    | "filterState"
    | "displaySelection"
    | "refresh"
    | "tabs"
    | "sortRecovery"
    | "arrival"
    | "props"
  >,
) {
  const {
    ROW_ID_DEFAULT_KEY,
    location,
    tableProps,
    allColumns,
    labelKey,
    formComponents,
  } = scope.configuration;
  const { data } = scope.listState;
  const { $authFetch, tableRows } = scope.rows;
  const { showArchived } = scope.filterState;
  const { isRowActionEnabled } = scope.displaySelection;
  const { refreshCounts } = scope.refresh;
  const { t } = scope.tabs;
  const { toast } = scope.sortRecovery;
  const { processI18n } = scope.arrival;
  const { props } = scope;
  const { getDataType } = useDataTypes();
  const inlineEditing = useTableInlineEdit<T>({
    inlineEdit: props.inlineEdit,
    editFields: formComponents.edit?.options?.fields,
    columns: allColumns,
    data,
    rowIdKey: props.rowIdKey ?? ROW_ID_DEFAULT_KEY,
    labelKey,
    location,
    api: $authFetch,
    getDataType,
    canEditRow: (row) =>
      isRowActionEnabled(tableProps.value.rowActions?.edit, row),
    isEnabled: computed(() => !tableRows.isSource && !showArchived.value),
    getRow: (id) => tableRows.getRow(id),
    onSaved: () => refreshCounts(),
    onError: (failure) =>
      toast.add({
        title: t("dms.table.inline_edit.error"),
        description: describeTableWriteError(
          failure,
          t,
          allColumns,
          processI18n,
        ),
        color: Color.error,
        icon: "i-ph-warning-circle",
      }),
  });
  const inlineEditSlots = computed(() =>
    inlineEditing.columns.value.map(({ columnId }) => `${columnId}-cell`),
  );
  return { inlineEditing, inlineEditSlots };
}
