import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import type { RowActionRule } from "../types/row-action";
import { validateRowsAgainstRule } from "./data-functions";
import { TableViewMeta } from "./meta";
import type { TableViewRowActionOptions } from "./options";
import { DEFAULT_ROW_ID_FIELD } from "./options";

type ValidatedActionName = "delete" | "edit" | "archive" | "restore";

enum EmptyResultBehavior {
  Graceful = 0,
  Strict = 1,
}

interface ActionValidationConfig {
  extractIds: (params: unknown, ...args: unknown[]) => string[];
  emptyResultBehavior: EmptyResultBehavior;
  emptyResult?: unknown;
  transformParams?: (params: unknown, eligibleIds: string[]) => unknown;
  transformArgs?: (args: unknown[], eligibleIds: string[]) => unknown[];
}

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
  archive: {
    extractIds: (_params, ids) => normalizeToArray(ids as string | string[]),
    emptyResultBehavior: EmptyResultBehavior.Graceful,
    emptyResult: { success: true, archivedCount: 0 },
    transformArgs: (_args, eligibleIds) => [eligibleIds],
  },
  restore: {
    extractIds: (_params, ids) => normalizeToArray(ids as string | string[]),
    emptyResultBehavior: EmptyResultBehavior.Graceful,
    emptyResult: { success: true, restoredCount: 0 },
    transformArgs: (_args, eligibleIds) => [eligibleIds],
  },
};

interface ValidationContext {
  rules: TableViewRowActionOptions | undefined;
  strictMode: boolean;
  idField: string;
}

const getValidationContext = (controller: unknown): ValidationContext => {
  const meta = GetMetadata(
    (controller as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );
  return {
    rules: meta.controllerRowActionRules,
    strictMode: meta.options.strictRuleValidation ?? false,
    idField: meta.options.rowIdKey || DEFAULT_ROW_ID_FIELD,
  };
};

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
      const validationCtx = getValidationContext(this);

      if (!validationCtx.rules) {
        return baseRoute.func.call(this, ctx, params, ...args);
      }

      const rule = extractRuleFromConfig(validationCtx.rules, actionName);

      if (!rule) {
        return baseRoute.func.call(this, ctx, params, ...args);
      }

      const ids = config.extractIds(params, ...args);
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

      const finalArgs = config.transformArgs
        ? config.transformArgs(args, eligibleIds)
        : args;

      return baseRoute.func.call(this, ctx, finalParams, ...finalArgs);
    },
    args: baseRoute.args,
    method: baseRoute.method,
  };
};
