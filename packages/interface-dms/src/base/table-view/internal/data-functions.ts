import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerInstance } from "@antelopejs/interface-data-api";

/**
 * The figures of a footer, by summary id.
 *
 * @internal
 */
export type FooterSummaryValues = Record<string, number>;

/**
 * The most distinct values of one column a table view draws as badges; a
 * column holding more shows its values plain.
 *
 * @internal
 */
export const MAX_COLUMN_VALUES = 25;

/**
 * The distinct values one column holds over the rows a caller may list.
 *
 * @internal
 */
export interface ColumnValues {
  column: string;
  /** Its text values, in no order; values of any other type are left out. */
  values: string[];
  /** Whether the column holds at most {@link MAX_COLUMN_VALUES} distinct values. */
  complete: boolean;
}

/** @internal */
export type RowBulkOperationParams = [
  thisObj: DataControllerInstance,
  ctx: RequestContext,
  ids: string | string[],
];
