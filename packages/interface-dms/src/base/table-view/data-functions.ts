import type { RequestContext } from "@antelopejs/interface-api";
import { InterfaceFunction } from "@antelopejs/interface-core";
import type {
  DataControllerCallback,
  DataControllerCallbackWithOptions,
} from "@antelopejs/interface-data-api";
import type { RowFields } from "@antelopejs/interface-data-api/metadata";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import type { User } from "../../auth/db";
import type { RowActionRule } from "../types/row-action";
import type { TableViewMeta } from "./meta";
import type { TableViewFooterSummary } from "./options";
import type {
  FooterSummaryValues,
  RowBulkOperationParams,
} from "./internal/data-functions";

/**
 * The page of rows a table view's list answers: the listable fields of each
 * row, read through a guard, and where the page sits among every row the
 * filters and search match.
 */
export interface TableViewListPage {
  results: RowFields[];
  total: number;
  offset: number;
  limit: number;
}

/** @internal */
export const listWithSearch =
  InterfaceFunction<
    (
      thisObj: DataControllerCallback | DataControllerCallbackWithOptions,
      ctx: RequestContext,
      listParams: Parameters.ListParameters,
      user?: User,
      permissions?: Set<string>,
    ) => Promise<TableViewListPage>
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
  // oxlint-disable-next-line eslint/max-params -- The runtime implements summarizeWithSearch with this positional interface signature.
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
 * A table's rows as a route outside its data controller reads them (a page's
 * route, another controller's): the model they are read with and the table's
 * metadata, nothing else of the controller.
 */
export interface BulkRowSource {
  /**
   * The model the rows are read with: the one the calling route is given for
   * its request (`@Model(...)` on its own controller), so the request's tenant.
   */
  model: object;
  /** The table's metadata: `GetMetadata(<data controller class>, TableViewMeta)`. */
  tableView: TableViewMeta;
}

/**
 * The ids of the rows a bulk custom action runs on: the `ids` the selection
 * sent, or — after "Select all N matching" (`allMatching=true`) — every row
 * the table's filters, search and archive view match. Either way it refuses
 * (403) a caller without the table's `list` permission; the route still checks
 * the permission of the action itself. The matching rows are capped (see
 * `MAX_BULK_MATCHING_ROWS`).
 *
 * `table` is `this` from a route of the table's data controller, or a
 * `BulkRowSource` from any other route. A source carries no controller: a
 * filter or a locked field reading another property of the controller
 * throws, naming it, and is resolved from a route of the controller instead.
 */
export const resolveBulkRowIds = InterfaceFunction<
  (
    /** `this` of a data controller, or a `BulkRowSource`. */
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The runtime proxy accepts controller instances or BulkRowSource; replacing its published unknown input would narrow existing callers.
    table: unknown,
    ctx: RequestContext,
    user: User,
  ) => Promise<string[]>
>();

/** The most rows "Select all N matching" hands a bulk action at once. */
export const MAX_BULK_MATCHING_ROWS = 10_000;

/** Query flag of a bulk request covering every matching row. */
export const BULK_ALL_MATCHING_KEY = "allMatching";

/** @internal */
export const startExport = InterfaceFunction<
  // oxlint-disable-next-line eslint/max-params -- The runtime implements startExport with this positional interface signature.
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
export const fetchRowForGuard = InterfaceFunction<
  (
    controller: DataControllerCallback | DataControllerCallbackWithOptions,
    id: string,
    idField: string,
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Guard rows come from module-owned models through this published runtime proxy; values have no shared schema here.
  ) => Promise<Record<string, unknown> | undefined>
>();
