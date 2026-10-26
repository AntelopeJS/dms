import { computed, watch, type Ref } from "vue";
import type {
  ColumnPinningState,
  SortingState,
  VisibilityState,
} from "@tanstack/vue-table";
import type { Data, TableProps } from "./Table.types";
import { defaultSortingState } from "../../composables/table-view/utils/sortableColumns";
import { mergeColumnOrder } from "../../composables/table/utils/columnOrder";

interface PreferenceState {
  columnOrderState: Ref<string[]>;
  columnPinningState: Ref<ColumnPinningState>;
  columnVisibilityState: Ref<VisibilityState>;
  sortingState: Ref<SortingState>;
  isUsingDefaultSort: Ref<boolean>;
}
export function useTableComponentPreferences<T extends Data>(
  props: TableProps<T>,
  states: PreferenceState,
  declaredColumnOrder: string[],
) {
  const {
    columnOrderState,
    columnPinningState,
    columnVisibilityState,
    sortingState,
    isUsingDefaultSort,
  } = states;
  watch(columnOrderState, (order) => {
    const merged = mergeColumnOrder(order, declaredColumnOrder);
    if (!isSameColumnList(merged, order)) columnOrderState.value = merged;
  });
  const baselineColumnOrder = declaredColumnOrder;

  function isSameColumnList(a: readonly unknown[], b: readonly unknown[]) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  const baselineColumnPinning: ColumnPinningState = JSON.parse(
    JSON.stringify(columnPinningState.value),
  );

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

  return { hasCustomSort, resetSorting, hasCustomColumns };
}
