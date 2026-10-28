import type { Table } from "@tanstack/vue-table";
import type { Data, TableProps } from "./Table.types";
import type { theme } from "./tableComponentTheme";
import type { useTableComponentGroups } from "./tableComponentGroups";
import type { useTableComponentRows } from "./tableComponentRows";
import type { useTableComponentPinning } from "./tableComponentPinning";
import type { useReorderHandles } from "../../composables/table-view/useReorderHandles";

export type TableBodyContext<T extends Data> = Pick<
  TableProps<T>,
  | "grouping"
  | "loading"
  | "reorder"
  | "rowActions"
  | "loadError"
  | "emptyStates"
> &
  Omit<ReturnType<typeof useTableComponentRows<T>>, "hoveredRowId"> &
  Pick<
    ReturnType<typeof useTableComponentPinning<T>>,
    "getPinnedVariant" | "getPinnedLeftOffset" | "getPinnedRightOffset"
  > & {
    t: ReturnType<typeof useI18n>["t"];
    uiTable: ReturnType<typeof theme>;
    table: Table<T>;
    bodyEntries: ReturnType<
      typeof useTableComponentGroups<T>
    >["bodyEntries"]["value"];
    collapsedGroups: string[];
    toggleGroup: (key: string) => void;
    leadingCellCount: number;
    reorderHandles: ReturnType<typeof useReorderHandles>;
    hasPresenceRail: boolean;
    SELECTION_RAIL_BG: string;
    PRESENCE_RAIL_WIDTH_PX: string;
    syncClippedTitle: (event: MouseEvent) => void;
    expandedRowDomId: (rowId: string) => string;
    isFirstPageLoading: boolean;
    skeletonRowCount: number;
    skeletonRowOpacity: (rowIndex: number) => number;
    skeletonWidth: (rowIndex: number, columnIndex: number) => string;
    isShowingArchived: boolean;
  };
