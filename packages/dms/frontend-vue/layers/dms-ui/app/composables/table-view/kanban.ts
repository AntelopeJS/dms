import type { InjectionKey, Ref } from "vue";
import type { TableViewColumn } from "./types";

/**
 * The few inputs the (unchanged) KanbanBoard needs beyond the generic
 * {@link TableViewDisplayContext}: the two-way group-by field shared with the
 * options-menu selector, and the raw edit/delete action configs for per-row rule
 * evaluation. Everything else (query, componentId, pageId, labelKey) is read from
 * the generic context. Provided by TableView and injected by the kanban adapter
 * — slotted content is a descendant of TableView, so a native inject reaches it.
 */
export interface KanbanDisplayBridge {
  groupByField: Ref<string>;
  editAction?: boolean | RowActionConfig;
  deleteAction?: boolean | RowActionConfig;
}

export const KANBAN_DISPLAY_BRIDGE_KEY: InjectionKey<KanbanDisplayBridge> =
  Symbol("dms:kanban-display-bridge");

export interface KanbanColumnDef {
  /** Stringified value, used as key and in filter queries */
  value: string;
  /** Raw value persisted on the item when a card is dropped here */
  rawValue: unknown;
  label: string;
  color?: string;
}

export interface KanbanSelectItemOption {
  value: unknown;
  label: string;
  icon?: string;
  iconColor?: string;
  textColor?: string;
}

export type KanbanLabelTranslator = (label: string) => string;

interface KanbanColumnTypeOptions extends Record<string, unknown> {
  multiple?: boolean;
  items?: KanbanSelectItemOption[];
  onlineLabel?: string;
  offlineLabel?: string;
  onlineColor?: string;
  offlineColor?: string;
}

interface KanbanColumnBuilderContext {
  options?: KanbanColumnTypeOptions;
  translate: KanbanLabelTranslator;
}

interface KanbanColumnTypeHandler {
  isEligible: (options?: KanbanColumnTypeOptions) => boolean;
  build: (context: KanbanColumnBuilderContext) => KanbanColumnDef[];
}

interface BinaryColumnLabels {
  trueLabel: string;
  falseLabel: string;
  trueColor?: string;
  falseColor?: string;
}

const BOOLEAN_COLUMN_LABELS: BinaryColumnLabels = {
  trueLabel: "$dms.table.filter.boolean.checked",
  falseLabel: "$dms.table.filter.boolean.unchecked",
  trueColor: "success",
};

const STATUS_COLUMN_DEFAULTS = {
  onlineLabel: "$common.status.online",
  offlineLabel: "$common.status.offline",
  onlineColor: "primary",
};

const buildBinaryColumns = (
  translate: KanbanLabelTranslator,
  labels: BinaryColumnLabels,
): KanbanColumnDef[] => [
  {
    value: "false",
    rawValue: false,
    label: translate(labels.falseLabel),
    color: labels.falseColor,
  },
  {
    value: "true",
    rawValue: true,
    label: translate(labels.trueLabel),
    color: labels.trueColor,
  },
];

const buildSelectColumns = ({
  options,
  translate,
}: KanbanColumnBuilderContext): KanbanColumnDef[] =>
  (options?.items ?? []).map((item) => ({
    value: String(item.value),
    rawValue: item.value,
    label: translate(item.label),
    color: item.iconColor || item.textColor,
  }));

const buildStatusColumns = ({
  options,
  translate,
}: KanbanColumnBuilderContext): KanbanColumnDef[] =>
  buildBinaryColumns(translate, {
    trueLabel: options?.onlineLabel ?? STATUS_COLUMN_DEFAULTS.onlineLabel,
    falseLabel: options?.offlineLabel ?? STATUS_COLUMN_DEFAULTS.offlineLabel,
    trueColor: options?.onlineColor ?? STATUS_COLUMN_DEFAULTS.onlineColor,
    falseColor: options?.offlineColor,
  });

const KANBAN_COLUMN_TYPE_HANDLERS: Record<string, KanbanColumnTypeHandler> = {
  select: {
    isEligible: (options) => !options?.multiple,
    build: buildSelectColumns,
  },
  boolean: {
    isEligible: () => true,
    build: ({ translate }) =>
      buildBinaryColumns(translate, BOOLEAN_COLUMN_LABELS),
  },
  status: {
    isEligible: () => true,
    build: buildStatusColumns,
  },
};

const getColumnTypeOptions = (
  column: TableViewColumn,
): KanbanColumnTypeOptions | undefined =>
  column.type.inputComponent?.options as KanbanColumnTypeOptions | undefined;

export const isEligibleKanbanColumn = (column: TableViewColumn): boolean => {
  const handler = KANBAN_COLUMN_TYPE_HANDLERS[column.type.id];
  return !!handler?.isEligible(getColumnTypeOptions(column));
};

export const buildKanbanColumns = (
  column: TableViewColumn,
  translate: KanbanLabelTranslator,
): KanbanColumnDef[] => {
  const handler = KANBAN_COLUMN_TYPE_HANDLERS[column.type.id];
  if (!handler) return [];
  return handler.build({ options: getColumnTypeOptions(column), translate });
};
