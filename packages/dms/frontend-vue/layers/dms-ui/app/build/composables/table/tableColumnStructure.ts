import type { Data, TableColumn } from "../../components/table/Table.vue";
import Button from "@nuxt/ui/components/Button.vue";
import Checkbox from "@nuxt/ui/components/Checkbox.vue";
import {
  ACTIONS_COLUMN_ID,
  EXPAND_COLUMN_ID,
  SELECT_COLUMN_ID,
} from "./constants";
import type { TableColumnMeta } from "./types";

import type { TableColumnContext } from "./tableColumnTypes";

import { buildHeaderRenderer } from "./tableColumnHeaders";

const EXPAND_COLUMN_SIZE = 52;

const EXPAND_ICON_CLASS = "size-4 transition-transform duration-200";

const EXPAND_ICON_OPEN_CLASS = "rotate-90";

const EXPAND_BUTTON_CLASS =
  "text-dimmed hover:text-highlighted group-data-[expanded=true]:text-highlighted";

const buildTypedCell = <T extends Data>(
  context: TableColumnContext<T>,
  col: TableColumn<T>,
) => {
  const { renderColumnValue } = context;
  return ({ row }: { row: { original: T } }) =>
    renderColumnValue(col, row.original);
};

export const processColumn = <T extends Data>(
  context: TableColumnContext<T>,
  col: TableColumn<T>,
): TableColumn<T> => {
  const { isNumericColumn } = context;

  if (!col.id && "accessorKey" in col) {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- TanStack permits generic keyof T accessors but requires a string id. Inference and its owner types cannot prove this legacy assignment; coercion would change numeric-key behavior.
    col.id = col.accessorKey as string;
  }

  if (!isString(col.header) || col.id === ACTIONS_COLUMN_ID) {
    return col;
  }

  if (col.type || col.display) {
    col.cell = buildTypedCell(context, col);
  }

  const label = col.header;
  if (!col.meta) {
    col.meta = {} satisfies TableColumnMeta;
  }
  col.meta.label = label;
  if (isNumericColumn(col)) {
    col.meta.align = "right";
  }

  col.header = buildHeaderRenderer(context, label);
  return col;
};

export const addExpandColumn = <T extends Data>(
  context: TableColumnContext<T>,
  columns: TableColumn<T>[],
) => {
  const { config, t, appConfig } = context;

  if (!config.expandable) return;

  columns.unshift({
    id: EXPAND_COLUMN_ID,
    size: EXPAND_COLUMN_SIZE,
    enableColumnFilter: false,
    enableSorting: false,

    header: () => h("span", { class: "sr-only" }, t("dms.table.expand_row")),
    cell: ({ row }) => {
      const isExpanded = row.getIsExpanded();
      return h(
        Button,
        {
          "aria-label": isExpanded
            ? t("dms.table.collapse_row")
            : t("dms.table.expand_row"),
          "aria-expanded": isExpanded,
          "aria-controls": isExpanded
            ? config.expandedRowDomId?.(row.id)
            : undefined,
          color: Color.neutral,
          variant: ButtonVariant.ghost,
          size: Size.tiny,
          square: true,
          class: EXPAND_BUTTON_CLASS,
          onClick: (event: Event) => {
            event.stopPropagation();
            row.toggleExpanded();
          },
          onDblclick: (event: Event) => event.stopPropagation(),
        },
        {
          leading: () =>
            h(resolveComponent("Icon"), {
              name: appConfig.ui.icons.chevronRight,
              class: [EXPAND_ICON_CLASS, isExpanded && EXPAND_ICON_OPEN_CLASS],
            }),
        },
      );
    },
  });
};

export const addRowSelectionColumn = <T extends Data>(
  context: TableColumnContext<T>,
  columns: TableColumn<T>[],
) => {
  const { config } = context;

  const hasBulkAction =
    normalizeActionConfig(config.rowActions?.delete).isEnabled ||
    normalizeActionConfig(config.rowActions?.archive).isEnabled ||
    normalizeActionConfig(config.rowActions?.restore).isEnabled ||
    config.canExport === true;

  if (!config.rowActions?.hasSelection || !hasBulkAction) {
    return;
  }

  columns.unshift({
    id: SELECT_COLUMN_ID,
    size: 52,
    enableColumnFilter: false,
    header: ({ table }) =>
      h(Checkbox, {
        modelValue: table.getIsSomePageRowsSelected()
          ? "indeterminate"
          : table.getIsAllPageRowsSelected(),
        "onUpdate:modelValue": (value) =>
          table.toggleAllPageRowsSelected(Boolean(value)),
        ariaLabel: "Select all",
      }),
    cell: ({ row }) =>
      h(Checkbox, {
        "data-checked": row.getIsSelected(),
        modelValue: row.getIsSelected(),
        "onUpdate:modelValue": (value) => row.toggleSelected(Boolean(value)),
        class: config.ui.value.rowSelection({
          rowSelected: row.getIsSelected(),
        }),
        onClick: (e: Event) => e.stopPropagation(),
        onDblclick: (e: Event) => e.stopPropagation(),
      }),
  });
};
