import type { RequestContext } from "@antelopejs/interface-api";
import type { DataControllerInstance } from "@antelopejs/interface-data-api";

/**
 * The figures of a footer, by summary id.
 *
 * @internal
 */
export type FooterSummaryValues = Record<string, number>;

/** @internal */
export type RowBulkOperationParams = [
  thisObj: DataControllerInstance,
  ctx: RequestContext,
  ids: string | string[],
];
