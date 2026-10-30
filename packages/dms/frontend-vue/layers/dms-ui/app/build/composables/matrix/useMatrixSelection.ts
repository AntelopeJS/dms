import { computed, reactive, type ComputedRef } from "vue";
import type { MatrixRow } from "../../../types/matrix";

/** The header checkbox: every row shown checked, some, or none. */
export type MatrixSelectAllState = boolean | "indeterminate";

export interface MatrixSelection {
  /** The checked row ids, in no particular order. */
  ids: ComputedRef<string[]>;
  isSelected: (rowId: string) => boolean;
  toggle: (rowId: string) => void;
  /** Checks every row shown, or unchecks them when they all are. */
  toggleAll: () => void;
  allState: ComputedRef<MatrixSelectAllState>;
  clear: () => void;
  /** Unchecks every row but `ids`. */
  keepOnly: (ids: string[]) => void;
}

/**
 * The rows checked in a `selectable` grid: a checkbox per row and one in the
 * header for the rows shown. The fills receive the checked ids (`selected`).
 */
export function useMatrixSelection(rows: () => MatrixRow[]): MatrixSelection {
  const selected = reactive(new Set<string>());
  const shownIds = () => rows().map((row) => row.id);
  const allState = computed<MatrixSelectAllState>(() => {
    const ids = shownIds();
    const checked = ids.filter((id) => selected.has(id)).length;
    if (checked === 0) return false;
    return checked === ids.length ? true : "indeterminate";
  });
  return {
    ids: computed(() => [...selected]),
    isSelected: (rowId) => selected.has(rowId),
    toggle: (rowId) => {
      if (selected.has(rowId)) selected.delete(rowId);
      else selected.add(rowId);
    },
    toggleAll: () => {
      const isAll = allState.value === true;
      for (const id of shownIds()) {
        if (isAll) selected.delete(id);
        else selected.add(id);
      }
    },
    allState,
    clear: () => selected.clear(),
    keepOnly: (ids) => {
      const kept = new Set(ids);
      for (const id of [...selected]) {
        if (!kept.has(id)) selected.delete(id);
      }
    },
  };
}
