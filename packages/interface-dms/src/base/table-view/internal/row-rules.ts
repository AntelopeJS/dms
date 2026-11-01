import type { RequestContext } from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import type { Parameters as DataParameters } from "@antelopejs/interface-data-api/components";
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

/** The parameters each validated action's route receives second. */
interface ValidatedActionParams {
  delete: DataParameters.DeleteParameters;
  edit: DataParameters.EditParameters;
  archive: string[];
  restore: string[];
}

interface ActionValidationConfig<P> {
  extractIds: (params: P) => string[];
  emptyResultBehavior: EmptyResultBehavior;
  emptyResult?: unknown;
  transformParams?: (params: P, eligibleIds: string[]) => P;
}

/** @internal */
export const normalizeToArray = (value: string | string[]): string[] =>
  Array.isArray(value) ? value : [value];

/** The row-rule validation of each validated action. */
type ActionValidationConfigs = {
  [K in ValidatedActionName]: ActionValidationConfig<ValidatedActionParams[K]>;
};

const ACTION_VALIDATION_CONFIGS: ActionValidationConfigs = {
  delete: {
    extractIds: (params) => normalizeToArray(params.id),
    emptyResultBehavior: EmptyResultBehavior.Graceful,
    emptyResult: { deleted: 0 },
    transformParams: (params, eligibleIds) => ({
      ...params,
      id: eligibleIds,
    }),
  },
  edit: {
    extractIds: (params) => [params.id],
    emptyResultBehavior: EmptyResultBehavior.Strict,
  },
  archive: {
    extractIds: (ids) => normalizeToArray(ids),
    emptyResultBehavior: EmptyResultBehavior.Graceful,
    emptyResult: { success: true, archivedCount: 0 },
    transformParams: (_ids, eligibleIds) => eligibleIds,
  },
  restore: {
    extractIds: (ids) => normalizeToArray(ids),
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

const getValidationContext = (
  controller: Parameters<typeof validateRowsAgainstRule>[0] & {
    constructor: ConstructorParameters<typeof TableViewMeta>[0];
  },
  actionName: ValidatedActionName,
): ValidationContext => {
  const meta = GetMetadata(controller.constructor, TableViewMeta);
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
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The action option explicitly permits boolean shorthand or an object rule configuration.
  if (typeof actionConfig === "object" && actionConfig !== null) {
    return actionConfig.rule;
  }
  return undefined;
};

const handleNoEligibleIds = <P>(
  config: ActionValidationConfig<P>,
  actionName: ValidatedActionName,
): ActionValidationConfig<P>["emptyResult"] => {
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
export const createValidatedRoute = <
  K extends ValidatedActionName,
  O,
  R,
  Rest extends unknown[],
>(
  baseRoute: DataControllerCallback<
    O,
    R,
    [RequestContext, ValidatedActionParams[K], ...Rest]
  >,
  actionName: K,
): DataControllerCallback<
  O,
  unknown,
  [RequestContext, ValidatedActionParams[K], ...Rest]
> => {
  const config: ActionValidationConfig<ValidatedActionParams[K]> =
    ACTION_VALIDATION_CONFIGS[actionName];

  return {
    func: async function (
      this: Parameters<typeof validateRowsAgainstRule>[0] & {
        constructor: ConstructorParameters<typeof TableViewMeta>[0];
      },
      ctx: RequestContext,
      params: ValidatedActionParams[K],
      ...args: Rest
    ) {
      const validationCtx = getValidationContext(this, actionName);
      const { rule } = validationCtx;

      if (!rule) {
        return baseRoute.func.call(this, ctx, params, ...args);
      }

      const ids = config.extractIds(params);
      const { eligibleIds } = await validateRowsAgainstRule(
        this,
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
