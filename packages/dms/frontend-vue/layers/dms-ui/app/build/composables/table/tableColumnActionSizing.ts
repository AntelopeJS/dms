import type { Data, TableColumn } from "../../components/table/Table.vue";
import { ACTIONS_COLUMN_ID } from "./constants";

import type {
  TableColumnContext,
  RowActionDescriptor,
} from "./tableColumnTypes";

import {
  isCustomActionInline,
  isOffMode,
  buildRowActionDescriptors,
  BUILTIN_ROW_ACTION_KEYS,
} from "./tableColumnActionDescriptors";

import { renderActionsCell } from "./tableColumnActionRendering";

const ACTIONS_COLUMN_BASE_SIZE = 55;

const ACTIONS_COLUMN_BUTTON_SIZE = 36;

const ACTIONS_CELL_GUTTERS = 28;

const ACTIONS_ICON_BUTTON_SIZE = 24;

const ACTIONS_BUTTON_GAP = 4;

const ACTIONS_LABEL_PADDING = 20;

const ACTIONS_LABEL_ICON_SIZE = 16;

const ACTIONS_LABEL_CHAR_SIZE = 6.5;

const ACTIONS_COLUMN_RESTORE_SIZE = 64;

const countConfiguredVisibleActions = <T extends Data>(
  context: TableColumnContext<T>,
): number => {
  const { config } = context;

  let count = 0;
  for (const key of BUILTIN_ROW_ACTION_KEYS) {
    if (isActionVisible(config.rowActions?.[key])) count++;
  }
  for (const action of config.rowActions?.custom || []) {
    if (isCustomActionInline(action)) count++;
  }
  return count;
};

const inlineButtonSize = (descriptor: RowActionDescriptor): number => {
  return descriptor.showLabel
    ? ACTIONS_LABEL_PADDING +
        (descriptor.icon ? ACTIONS_LABEL_ICON_SIZE : 0) +
        descriptor.label.length * ACTIONS_LABEL_CHAR_SIZE
    : ACTIONS_ICON_BUTTON_SIZE;
};

const hasLabelledInlineActions = <T extends Data>(
  context: TableColumnContext<T>,
): boolean => {
  const { config } = context;
  return (config.rowActions?.custom || []).some(
    (action) => isCustomActionInline(action) && action.showLabel,
  );
};

const actionsCellWidth = (descriptors: RowActionDescriptor[]): number => {
  const inline = descriptors.filter((d) => d.visible);
  const buttons = inline.length + (descriptors.length > inline.length ? 1 : 0);
  const width =
    inline.reduce((sum, d) => sum + inlineButtonSize(d), 0) +
    (descriptors.length > inline.length ? ACTIONS_ICON_BUTTON_SIZE : 0) +
    Math.max(buttons - 1, 0) * ACTIONS_BUTTON_GAP;
  return ACTIONS_CELL_GUTTERS + width;
};

const shownActionsWidth = <T extends Data>(
  context: TableColumnContext<T>,
  row: T,
): number => {
  return actionsCellWidth(
    buildRowActionDescriptors(context, row).filter(
      (d) => !d.disabled && !isOffMode(context, d),
    ),
  );
};

const labelledActionsColumnSize = <T extends Data>(
  context: TableColumnContext<T>,
): number => {
  const { config } = context;

  const rows = config.data.value;
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The empty-list width calculation intentionally evaluates actions against an empty row. Neither inference nor Data proves caller-selected T; constructing a real row would change this fallback.
  if (rows.length === 0) return shownActionsWidth(context, {} as T);
  return Math.max(...rows.map((value) => shownActionsWidth(context, value)));
};

const hasAnyRowAction = <T extends Data>(
  context: TableColumnContext<T>,
): boolean => {
  const { config } = context;

  const builtInEnabled = [
    config.rowActions?.add,
    config.rowActions?.delete,
    config.rowActions?.duplicate,
    config.rowActions?.edit,
    config.rowActions?.details,
    config.rowActions?.archive,
    config.rowActions?.restore,
  ].some((flag) => normalizeActionConfig(flag).isEnabled);

  const hasCustomActions =
    !!config.rowActions?.custom && config.rowActions.custom.length > 0;

  return builtInEnabled || hasCustomActions;
};

export const addRowActionsColumn = <T extends Data>(
  context: TableColumnContext<T>,
  columns: TableColumn<T>[],
) => {
  const { config } = context;

  if (!hasAnyRowAction(context)) {
    return;
  }

  const visibleActionCount = countConfiguredVisibleActions(context);
  const restoreRoom =
    config.showArchived &&
    normalizeActionConfig(config.rowActions?.restore).isEnabled
      ? ACTIONS_COLUMN_RESTORE_SIZE
      : 0;
  const columnSize =
    (hasLabelledInlineActions(context)
      ? labelledActionsColumnSize(context)
      : ACTIONS_COLUMN_BASE_SIZE +
        visibleActionCount * ACTIONS_COLUMN_BUTTON_SIZE) + restoreRoom;

  columns.push({
    id: ACTIONS_COLUMN_ID,
    size: columnSize,
    enableColumnFilter: false,
    cell: ({ row }) => renderActionsCell(context, row),
  });
};
