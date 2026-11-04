import { isString } from "#dms-core/app/utils/type-check";
import {
  resolveRowClickAction,
  type RowClickAction,
} from "../../../utils/rowClickAction";
import { ref } from "vue";
import { get } from "@nuxt/ui/runtime/utils/index.js";
import { isRowClickTrigger } from "../../utils/rowClickTrigger";

import type {
  Data,
  TableProps,
  TableEmits,
  TableRowPresenceActor,
} from "./Table.types";
import { PANEL_MATCH_BG, ROW_HOVER_CELL_BG } from "./tableComponentTheme";

export function useTableComponentRows<T extends Data>(
  props: TableProps<T>,
  emits: TableEmits<T>,
  t: ReturnType<typeof useI18n>["t"],
) {
  const PRESENCE_RAIL_ACTIVE_BG = "bg-secondary";
  const DEFAULT_ROW_ID_KEY = "_id";
  const rowIdKey = props.rowIdKey ?? DEFAULT_ROW_ID_KEY;
  const hoveredRowId = ref<string | null>(null);

  const handleRowHover = (row: { original: T; id: string }) => {
    hoveredRowId.value = get(row.original, rowIdKey);
  };

  const handleRowLeave = () => {
    hoveredRowId.value = null;
  };

  const getRowPresence = (row: T): TableRowPresenceActor[] | undefined => {
    if (!props.presenceByRow) return undefined;
    const id: string | undefined = get(row, rowIdKey);
    if (!id) return undefined;
    const actors = props.presenceByRow[id];
    return actors && actors.length > 0 ? actors : undefined;
  };

  const presenceTooltipText = (actors: TableRowPresenceActor[]): string =>
    t("dms.realtime.row_edited_by", {
      names: actors.map((a) => a.displayName || a.id).join(", "),
    });

  const rowClickAction = (row: T): RowClickAction | undefined =>
    resolveRowClickAction(props.rowActions, row);

  const isRowClickable = (row: T): boolean =>
    props.rowClick !== "none" && rowClickAction(row) !== undefined;

  const runRowClickAction = (row: T) => {
    const action = rowClickAction(row);
    if (!action) return;
    if (isString(action)) {
      emits(action, row);
      return;
    }
    props.onCustomRowAction?.(action, row);
  };

  const handleRowPointer = (event: MouseEvent, row: T) => {
    if (!isRowClickTrigger(props.rowClick, event)) return;
    runRowClickAction(row);
  };

  const isOpenRow = (row: T): boolean =>
    props.openRowId !== undefined &&
    String(get(row, rowIdKey)) === props.openRowId;

  const isSingleClickRow = (row: T): boolean =>
    props.rowClick === "single" && isRowClickable(row);

  const presenceRailBackground = (row: T): string => {
    if (getRowPresence(row)) return PRESENCE_RAIL_ACTIVE_BG;
    if (props.loading || !isRowClickable(row)) return PANEL_MATCH_BG;
    return `${PANEL_MATCH_BG} ${ROW_HOVER_CELL_BG}`;
  };
  return {
    hoveredRowId,
    handleRowHover,
    handleRowLeave,
    getRowPresence,
    presenceTooltipText,
    isRowClickable,
    handleRowPointer,
    isOpenRow,
    isSingleClickRow,
    presenceRailBackground,
  };
}
