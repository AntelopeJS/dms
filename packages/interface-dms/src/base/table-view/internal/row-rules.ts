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

/** The parameters each validated action's route receives second. */
interface ValidatedActionParams {
  delete: DataParameters.DeleteParameters;
  edit: DataParameters.EditParameters;
  archive: string[];
  restore: string[];
}

/**
 * What each validated action answers when its row rules leave it no row to
 * run on. An edit has no such answer: it is refused with 403.
 */
interface NoEligibleIdsResults {
  delete: { deleted: number };
  edit: never;
  archive: { success: boolean; archivedCount: number };
  restore: { success: boolean; restoredCount: number };
}

interface ActionValidationConfig<K extends ValidatedActionName> {
  extractIds: (params: ValidatedActionParams[K]) => string[];
  noEligibleIds: () => NoEligibleIdsResults[K];
  transformParams?: (
    params: ValidatedActionParams[K],
    eligibleIds: string[],
  ) => ValidatedActionParams[K];
}

/** @internal */
export const normalizeToArray = (value: string | string[]): string[] =>
  Array.isArray(value) ? value : [value];

/** The row-rule validation of each validated action. */
type ActionValidationConfigs = {
  [K in ValidatedActionName]: ActionValidationConfig<K>;
};

const refuseEdit = (): never => {
  throwHttpAssert(
    false,
    403,
    "edit not allowed: row does not satisfy action rules",
  );
};

const ACTION_VALIDATION_CONFIGS: ActionValidationConfigs = {
  delete: {
    extractIds: (params) => normalizeToArray(params.id),
    noEligibleIds: () => ({ deleted: 0 }),
    transformParams: (params, eligibleIds) => ({
      ...params,
      id: eligibleIds,
    }),
  },
  edit: {
    extractIds: (params) => [params.id],
    noEligibleIds: refuseEdit,
  },
  archive: {
    extractIds: (ids) => normalizeToArray(ids),
    noEligibleIds: () => ({ success: true, archivedCount: 0 }),
    transformParams: (_ids, eligibleIds) => eligibleIds,
  },
  restore: {
    extractIds: (ids) => normalizeToArray(ids),
    noEligibleIds: () => ({ success: true, restoredCount: 0 }),
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
  R | NoEligibleIdsResults[K],
  [RequestContext, ValidatedActionParams[K], ...Rest]
> => {
  const config: ActionValidationConfig<K> =
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
        return config.noEligibleIds();
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
