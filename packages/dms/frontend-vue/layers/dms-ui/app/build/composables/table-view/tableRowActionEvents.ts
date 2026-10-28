import type { TableRowActionsConfig } from "./tableRowActionTypes";
import type { FormProps } from "../../../composables/form/types";
import { TableViewEvents } from "../../../composables/table-view/types";
import {
  getItemId,
  DEFAULT_ROW_ID_KEY,
  getErrorPayload,
} from "./tableRowActionValues";
import type { createTableRowNavigation } from "./tableRowActionNavigation";
export const createTableRowEvents = <T extends Data>(
  config: TableRowActionsConfig,
  navigation: ReturnType<typeof createTableRowNavigation<T>>,
) => {
  const { openRowByIdImpl, editRowImpl, newRowImpl, duplicateRowImpl } =
    navigation;
  const rowClickAction = useEventedAction<unknown>({
    componentId: config.componentId,
    events: {
      start: TableViewEvents.ROW_CLICK,
      success: TableViewEvents.ROW_CLICK_SUCCESS,
      error: TableViewEvents.ROW_CLICK_ERROR,
    },
  });

  const rowEditAction = useEventedAction<unknown>({
    componentId: config.componentId,
    events: {
      start: TableViewEvents.ROW_EDIT,
      success: TableViewEvents.ROW_EDIT_SUCCESS,
      error: TableViewEvents.ROW_EDIT_ERROR,
    },
  });

  const rowAddAction = useEventedAction<unknown>({
    componentId: config.componentId,
    events: {
      start: TableViewEvents.ROW_ADD,
      success: TableViewEvents.ROW_ADD_SUCCESS,
      error: TableViewEvents.ROW_ADD_ERROR,
    },
  });

  const rowDuplicateAction = useEventedAction<unknown>({
    componentId: config.componentId,
    events: {
      start: TableViewEvents.ROW_DUPLICATE,
      success: TableViewEvents.ROW_DUPLICATE_SUCCESS,
      error: TableViewEvents.ROW_DUPLICATE_ERROR,
    },
  });

  const openRowById = (itemId: string, item?: T) =>
    rowClickAction.execute(async () => openRowByIdImpl(itemId, item), {
      startPayload: { row: item },
      successPayload: () => ({ row: item }),
      errorPayload: (error) => ({ row: item, error: getErrorPayload(error) }),
    });

  const openRow = (item: T) => {
    const itemId = getItemId(item, config.rowIdKey ?? DEFAULT_ROW_ID_KEY);
    if (!itemId) return;
    return rowClickAction.execute(async () => openRowByIdImpl(itemId, item), {
      startPayload: { row: item },
      successPayload: () => ({ row: item }),
      errorPayload: (error) => ({ row: item, error: getErrorPayload(error) }),
    });
  };

  const editRow = (item: T, submitDefaults?: FormProps["submitDefaults"]) =>
    rowEditAction.execute(async () => editRowImpl(item, submitDefaults), {
      startPayload: { row: item },
      successPayload: () => ({ row: item }),
      errorPayload: (error) => ({ row: item, error: getErrorPayload(error) }),
    });

  const newRow = (submitDefaults?: FormProps["submitDefaults"]) =>
    rowAddAction.execute(async () => newRowImpl(submitDefaults), {
      startPayload: { action: "new" },
      successPayload: () => ({ action: "new" }),
      errorPayload: (error) => ({
        action: "new",
        error: getErrorPayload(error),
      }),
    });

  const duplicateRow = (itemId: string) =>
    rowDuplicateAction.execute(async () => duplicateRowImpl(itemId), {
      startPayload: { action: "duplicate", sourceId: itemId },
      successPayload: () => ({ action: "duplicate", sourceId: itemId }),
      errorPayload: (error) => ({
        action: "duplicate",
        sourceId: itemId,
        error: getErrorPayload(error),
      }),
    });

  return { openRowById, openRow, editRow, newRow, duplicateRow };
};
