import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import type { DataControllerCallback } from "@antelopejs/interface-data-api";
import type { Parameters } from "@antelopejs/interface-data-api/components";
import type { ComponentBuilder } from "../../component";
import type { RowActionRule } from "../types/row-action";
import { actingTableViewsOf, getRequestTableKey } from "./auth";
import { validateRowsAgainstRule } from "./data-functions";
import { TableViewMeta, type TableViewRowScope } from "./meta";
import type {
  TableViewOptionsSerialized,
  TableViewRowActionOptions,
} from "./options";
import { DEFAULT_ROW_ID_FIELD } from "./options";

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

type TableViewBuilder = ComponentBuilder<TableViewOptionsSerialized>;

// Reached without `withActionCheck` (a route composed by hand): the table view
// the request names, else every table view built over the controller.
const fallbackTableViews = (
  meta: TableViewMeta,
  ctx: RequestContext,
  actionName: ValidatedActionName,
): TableViewBuilder[] => {
  const tableKey = getRequestTableKey(ctx);
  if (tableKey === undefined) return [...meta.componentBuilders];
  const named = meta.tableViewFor(tableKey, actionName);
  throwHttpAssert(
    named,
    403,
    `Forbidden: table view ${tableKey} has no ${actionName} action`,
  );
  return [named];
};

/**
 * The rule a request's rows must satisfy: the controller-wide rule if one was
 * set, and the rule of the table view the request acts through. Acting
 * through several (a request naming none), a row passes when one of them
 * allows it: each is a table the caller may use. Undefined: nothing to check.
 */
// @internal
export const combineRowRules = (
  controllerRule: RowActionRule | undefined,
  tableRules: (RowActionRule | undefined)[],
): RowActionRule | undefined => {
  const tableRule =
    tableRules.length === 0 || tableRules.some((rule) => !rule)
      ? undefined
      : tableRules.length === 1
        ? tableRules[0]
        : { or: tableRules as RowActionRule[] };
  if (controllerRule && tableRule) return { and: [controllerRule, tableRule] };
  return controllerRule ?? tableRule;
};

const getValidationContext = (
  controller: unknown,
  ctx: RequestContext,
  actionName: ValidatedActionName,
): ValidationContext => {
  const meta = GetMetadata(
    (controller as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );
  const tableViews =
    actingTableViewsOf(ctx, actionName) ??
    fallbackTableViews(meta, ctx, actionName);
  const fallbackScope: TableViewRowScope = {
    idField: meta.options.rowIdKey || DEFAULT_ROW_ID_FIELD,
    strictMode: meta.options.strictRuleValidation ?? false,
  };
  const scopes = tableViews.map(
    (builder) => meta.rowScopeOf(builder) ?? fallbackScope,
  );
  return {
    rule: combineRowRules(
      extractRuleFromConfig(meta.controllerRowActionRules, actionName),
      scopes.map((scope) =>
        extractRuleFromConfig(scope.rowActions, actionName),
      ),
    ),
    // Strict only when every table acted through is: a lenient one is a way
    // the caller may already take.
    strictMode:
      scopes.length > 0
        ? scopes.every((scope) => scope.strictMode)
        : fallbackScope.strictMode,
    idField: (scopes[0] ?? fallbackScope).idField,
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
      const validationCtx = getValidationContext(this, ctx, actionName);
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
