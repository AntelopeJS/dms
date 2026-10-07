import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import type { RowActionRule } from "../../types/row-action";
import { validateRowsAgainstRule } from "../data-functions";
import { TableViewMeta } from "../meta";
import type { TableViewRowActionOptions } from "../options";
import { DEFAULT_ROW_ID_FIELD } from "../options";

type ValidatedActionName = "delete" | "edit" | "archive" | "restore";

enum EmptyResultBehavior {
  Graceful = 0,
  Strict = 1,
}

interface ActionValidationConfig {
  extractIds: (params: unknown) => string[];
  emptyResultBehavior: EmptyResultBehavior;
  emptyResult?: unknown;
  transformParams?: (params: unknown, eligibleIds: string[]) => unknown;
}

/** @internal */
export const normalizeToArray = (value: string | string[]): string[] =>
  Array.isArray(value) ? value : [value];

const ACTION_VALIDATION_CONFIGS: Record<
  ValidatedActionName,
  ActionValidationConfig
> = {
  delete: {
    extractIds: (params) =>
      normalizeToArray((params as Parameters.DeleteParameters).id),
    emptyResultBehavior: EmptyResultBehavior.Graceful,
    emptyResult: { deleted: 0 },
    transformParams: (params, eligibleIds) => ({
      ...(params as object),
      id: eligibleIds,
    }),
  },
  edit: {
    extractIds: (params) => [(params as Parameters.EditParameters).id],
    emptyResultBehavior: EmptyResultBehavior.Strict,
  },
  // A bulk route's first argument after the context is the id list itself:
  // the rows a rule rejects are dropped from it before the operation runs.
  archive: {
    extractIds: (ids) => normalizeToArray(ids as string | string[]),
    emptyResultBehavior: EmptyResultBehavior.Graceful,
    emptyResult: { success: true, archivedCount: 0 },
    transformParams: (_ids, eligibleIds) => eligibleIds,
  },
  restore: {
    extractIds: (ids) => normalizeToArray(ids as string | string[]),
    emptyResultBehavior: EmptyResultBehavior.Graceful,
    emptyResult: { success: true, restoredCount: 0 },
    transformParams: (_ids, eligibleIds) => eligibleIds,
  },
};

interface ValidationContext {
  rule: RowActionRule | undefined;
  strictMode: boolean;
  idField: string;
}

// The writing TableView's rules and options are the controller's: it is the
// only one the write routes serve.
const getValidationContext = (
  controller: unknown,
  actionName: ValidatedActionName,
): ValidationContext => {
  const meta = GetMetadata(
    (controller as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );
  return {
    rule: extractRuleFromConfig(meta.controllerRowActionRules, actionName),
    strictMode: meta.options.strictRuleValidation ?? false,
    idField: meta.options.rowIdKey || DEFAULT_ROW_ID_FIELD,
  };
};

/** @internal */
export const extractRuleFromConfig = (
  controllerRules: TableViewRowActionOptions | undefined,
  actionName: ValidatedActionName,
): RowActionRule | undefined => {
  const actionConfig = controllerRules?.[actionName];
  if (typeof actionConfig === "object" && actionConfig !== null) {
    return actionConfig.rule;
  }
  return undefined;
};

const handleNoEligibleIds = (
  config: ActionValidationConfig,
  actionName: ValidatedActionName,
): unknown => {
  if (config.emptyResultBehavior === EmptyResultBehavior.Strict) {
    throwHttpAssert(
      false,
      403,
      `${actionName} not allowed: row does not satisfy action rules`,
    );
  }
  return config.emptyResult;
};

/** @internal */
export const createValidatedRoute = (
  baseRoute: DataControllerCallback,
  actionName: ValidatedActionName,
): DataControllerCallback => {
  const config = ACTION_VALIDATION_CONFIGS[actionName];

  return {
    func: async function (
      this: unknown,
      ctx: RequestContext,
      params: unknown,
      ...args: unknown[]
    ) {
      const validationCtx = getValidationContext(this, actionName);
      const { rule } = validationCtx;

      if (!rule) {
        return baseRoute.func.call(this, ctx, params, ...args);
      }

      const ids = config.extractIds(params);
      const { eligibleIds } = await validateRowsAgainstRule(
        this as DataControllerCallback,
        ids,
        rule,
        validationCtx.strictMode,
        validationCtx.idField,
      );

      if (eligibleIds.length === 0) {
        return handleNoEligibleIds(config, actionName);
      }

      const finalParams = config.transformParams
        ? config.transformParams(params, eligibleIds)
        : params;

      return baseRoute.func.call(this, ctx, finalParams, ...args);
    },
    args: baseRoute.args,
    method: baseRoute.method,
  };
};
