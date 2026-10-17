import type { RequestContext } from "@antelopejs/interface-api";
import { InterfaceFunction } from "@antelopejs/interface-core";
import type {
  DataControllerCallback,
  DataControllerCallbackWithOptions,
  DefaultRoutes,
} from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import type { User } from "../../auth/db";
import type { RowActionRule } from "../types/row-action";
import type { TableViewFooterSummary } from "./options";
import type {
  FooterSummaryValues,
  RowBulkOperationParams,
} from "./internal/data-functions";

/** @internal */
export const listWithSearch = InterfaceFunction<
  (
    thisObj: DataControllerCallback | DataControllerCallbackWithOptions,
    ctx: RequestContext,
    listParams: Parameters.ListParameters,
    user?: User,
    permissions?: Set<string>,
  ) => Promise<{
    results: Record<string, unknown>[];
    total: number;
    offset: number;
    limit: number;
  }>
>();

/**
 * One row of the table read alone (the `get` route), joined, computed and
 * related fields included, `guard` run on it before its fields are read.
 *
 * @internal
 */
export const getTableViewRow =
  InterfaceFunction<
    (
      thisObj: unknown,
      ctx: RequestContext,
      params: Parameters.GetParameters,
      guard?: DefaultRoutes.GetGuard,
    ) => Promise<Record<string, unknown>>
  >();

/** @internal */
export const countWithSearch =
  InterfaceFunction<
    (
      thisObj: DataControllerCallback | DataControllerCallbackWithOptions,
      ctx: RequestContext,
      listParams: Parameters.ListParameters,
      user?: User,
      permissions?: Set<string>,
    ) => Promise<{ total: number }>
  >();

/** @internal */
export const summarizeWithSearch = InterfaceFunction<
  // A published contract: the runtime calls this positionally.
  // oxlint-disable-next-line eslint/max-params
  (
    thisObj: DataControllerCallback | DataControllerCallbackWithOptions,
    ctx: RequestContext,
    listParams: Parameters.ListParameters,
    summaries: Record<string, TableViewFooterSummary>,
    user?: User,
    permissions?: Set<string>,
  ) => Promise<FooterSummaryValues>
>();

/**
 * The ids of the rows a bulk custom action runs on: the `ids` the selection
 * sent, or — after "Select all N matching" (`allMatching=true`) — every row
 * the table's filters, search and archive view match. Either way it refuses
 * (403) a caller without the table's `list` permission; the route still checks
 * the permission of the action itself. The matching rows are capped (see
 * `MAX_BULK_MATCHING_ROWS`).
 *
 * `table` is the table's data controller: `this` from a route on it, or its
 * class from any other route (a page's, another controller's), which reads
 * the rows with the model the controller's own routes get for the request.
 */
export const resolveBulkRowIds =
  InterfaceFunction<
    (table: unknown, ctx: RequestContext, user: User) => Promise<string[]>
  >();

/** The most rows "Select all N matching" hands a bulk action at once. */
export const MAX_BULK_MATCHING_ROWS = 10_000;

/** Query flag of a bulk request covering every matching row. */
export const BULK_ALL_MATCHING_KEY = "allMatching";

/** @internal */
export const startExport = InterfaceFunction<
  // A published contract: the runtime calls this positionally and every
  // implementing module declares the same shape, so an options object
  // cannot be introduced from this side.
  // oxlint-disable-next-line eslint/max-params
  (
    thisObj: DataControllerCallback | DataControllerCallbackWithOptions,
    ctx: RequestContext,
    listParams: Parameters.ListParameters,
    format?: string,
    delivery?: string,
    ids?: string[],
    user?: User,
  ) => { jobId: string; format: string; extension: string }
>();

/** @internal */
export const getExportStatus = InterfaceFunction<
  (
    thisObj: DataControllerCallback | DataControllerCallbackWithOptions,
    ctx: RequestContext,
    exportId: string,
    user?: User,
  ) => {
    status: string;
    progress: number;
    error?: string;
  }
>();

/** @internal */
export const downloadExport =
  InterfaceFunction<
    (
      thisObj: DataControllerCallback | DataControllerCallbackWithOptions,
      ctx: RequestContext,
      exportId: string,
      user?: User,
    ) => void
  >();

/** @internal */
export const archiveRows = InterfaceFunction<
  (...args: RowBulkOperationParams) => {
    success: boolean;
    archivedCount: number;
  }
>();

/** @internal */
export const restoreRows = InterfaceFunction<
  (...args: RowBulkOperationParams) => {
    success: boolean;
    restoredCount: number;
  }
>();

interface RuleValidationResult {
  eligibleIds: string[];
  rejectedIds: string[];
}

/** @internal */
export const validateRowsAgainstRule =
  InterfaceFunction<
    (
      controller: DataControllerCallback | DataControllerCallbackWithOptions,
      ids: string[],
      rule: RowActionRule | undefined,
      strictMode: boolean,
      idField: string,
    ) => Promise<RuleValidationResult>
  >();

/** @internal */
export const fetchRowForGuard =
  InterfaceFunction<
    (
      controller: DataControllerCallback | DataControllerCallbackWithOptions,
      id: string,
      idField: string,
    ) => Promise<Record<string, unknown> | undefined>
  >();
