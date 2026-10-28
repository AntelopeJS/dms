import type { ColumnMeta, RowData } from "@tanstack/vue-table";
import type { ColumnDisplay } from "../data-types/useColumnValueRenderer";

declare module "@tanstack/vue-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Declaration merging requires TanStack's generic parameter names even though these added metadata fields do not use them.
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    align?: "right";
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Declaration merging requires TanStack's generic parameter names even though these added display fields do not use them.
  interface ColumnDefBase<TData extends RowData, TValue = unknown> {
    type?: DataTypeConfig;
    cellWrap?: boolean;
    display?: ColumnDisplay;
  }
}

export type TableColumnMeta = ColumnMeta<RowData, unknown>;
