import { isBoolean, isString } from "#dms-core/app/utils/type-check";
import type {
  KanbanConfig,
  TableViewDisplayConfig,
  TableViewGroupBy,
  TableViewGroupedConfig,
} from "../../../../composables/table-view/types/config";

type DisplayOptions = TableViewDisplayConfig["options"];

const GROUP_BY_VALUES: readonly TableViewGroupBy[] = ["value", "day", "week"];

const isOptionalOf = <T>(
  value: unknown,
  isType: (candidate: unknown) => candidate is T,
): value is T | undefined => value === undefined || isType(value);

const isGroupBy = (value: unknown): value is TableViewGroupBy =>
  GROUP_BY_VALUES.some((candidate) => candidate === value);

/** Whether the config declares the `kanban` display's options whole. */
export const isKanbanConfig = (
  options: DisplayOptions,
): options is NonNullable<DisplayOptions> & KanbanConfig =>
  !!options &&
  isString(options.groupByField) &&
  isOptionalOf(options.draggable, isBoolean) &&
  isOptionalOf(options.columnMaxHeight, isString);

/** Whether the config declares the `grouped` display's options whole. */
export const isGroupedConfig = (
  options: DisplayOptions,
): options is NonNullable<DisplayOptions> & TableViewGroupedConfig =>
  !!options &&
  isString(options.groupByField) &&
  isOptionalOf(options.by, isGroupBy) &&
  isOptionalOf(options.collapsible, isBoolean) &&
  isOptionalOf(options.count, isBoolean);
