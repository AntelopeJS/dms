import type { RequestContext } from "@antelopejs/interface-api";
import { InterfaceFunction } from "@antelopejs/interface-core";
import type {
  DataControllerCallback,
  DataControllerCallbackWithOptions,
} from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import type { User } from "../../auth/db";
import type { RowActionRule } from "../types/row-action";

// @internal
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

// @internal
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

// @internal
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

// @internal
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

// @internal
export const downloadExport =
  InterfaceFunction<
    (
      thisObj: DataControllerCallback | DataControllerCallbackWithOptions,
      ctx: RequestContext,
      exportId: string,
      user?: User,
    ) => void
  >();

export type RowBulkOperationParams = [
  thisObj: DataControllerCallback | DataControllerCallbackWithOptions,
  ctx: RequestContext,
  ids: string | string[],
];

// @internal
export const archiveRows = InterfaceFunction<
  (...args: RowBulkOperationParams) => {
    success: boolean;
    archivedCount: number;
  }
>();

// @internal
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

// @internal
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

// @internal
export const fetchRowForGuard =
  InterfaceFunction<
    (
      controller: DataControllerCallback | DataControllerCallbackWithOptions,
      id: string,
      idField: string,
    ) => Promise<Record<string, unknown> | undefined>
  >();
