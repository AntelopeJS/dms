import type { ShallowRef } from "vue";
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
}

export function buildTableViewShortcuts<T extends Data>({
  refresh,
  tableProps,
  newRow,
  globalFilter,
  rowSelect,
  data,
}: BuildTableViewShortcutsParams<T>): Record<string, () => void> {
  return {
    meta_r: createTableViewMetaRShortcut(refresh),
    shift_n: createTableViewShiftNShortcut(tableProps, newRow),
    escape: createTableViewEscapeShortcut(globalFilter, rowSelect),
    shift_a: createTableViewShiftAShortcut(tableProps, data, rowSelect),
  };
}
