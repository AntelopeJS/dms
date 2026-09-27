import { computed, type ComputedRef, type ShallowRef } from "vue";
import type { RowSelectionState } from "@tanstack/vue-table";
import type {
  TableRowActionOptions,
  Data,
} from "../../../build/components/table/Table.vue";
import {
  TABLE_VIEW_META_R_METADATA,
  createTableViewMetaRShortcut,
} from "./tableViewMetaR";
import {
  TABLE_VIEW_SHIFT_N_METADATA,
  createTableViewShiftNShortcut,
} from "./tableViewShiftN";
import {
  TABLE_VIEW_ESCAPE_METADATA,
  createTableViewEscapeShortcut,
  isTableViewEscapeActive,
} from "./tableViewEscape";
import {
  TABLE_VIEW_SHIFT_A_METADATA,
  createTableViewShiftAShortcut,
} from "./tableViewShiftA";
import { TABLE_VIEW_DELETE_METADATA } from "./tableViewDelete";
import { TABLE_VIEW_SHIFT_F_METADATA } from "./tableViewShiftF";

export const TABLE_VIEW_SHORTCUTS_METADATA = [
  TABLE_VIEW_META_R_METADATA,
  TABLE_VIEW_SHIFT_N_METADATA,
  TABLE_VIEW_ESCAPE_METADATA,
  TABLE_VIEW_SHIFT_A_METADATA,
  TABLE_VIEW_DELETE_METADATA,
  TABLE_VIEW_SHIFT_F_METADATA,
];

interface BuildTableViewShortcutsParams<T extends Data> {
  refresh: () => void;
  tableProps: ComputedRef<{
    rowActions?: TableRowActionOptions;
    rowIdKey?: string;
  }>;
  newRow: () => void;
  globalFilter: ShallowRef<string | undefined>;
  rowSelect: Ref<RowSelectionState>;
  data: Ref<{ results: T[] } | null | undefined>;
  activeElement: Ref<Element | null | undefined>;
}

type TableViewShortcuts = Record<string, (() => void) | undefined>;

export function buildTableViewShortcuts<T extends Data>({
  refresh,
  tableProps,
  newRow,
  globalFilter,
  rowSelect,
  data,
  activeElement,
}: BuildTableViewShortcutsParams<T>): ComputedRef<TableViewShortcuts> {
  const shortcuts = {
    meta_r: createTableViewMetaRShortcut(refresh),
    shift_n: createTableViewShiftNShortcut(tableProps, newRow),
    shift_a: createTableViewShiftAShortcut(tableProps, data, rowSelect),
  };
  const escape = createTableViewEscapeShortcut(globalFilter, rowSelect);
  // An unregistered key is left untouched by `defineShortcuts`, so Escape
  // reaches overlays whenever the table has nothing to clear.
  return computed(() => ({
    ...shortcuts,
    escape: isTableViewEscapeActive(globalFilter, rowSelect, activeElement)
      ? escape
      : undefined,
  }));
}
