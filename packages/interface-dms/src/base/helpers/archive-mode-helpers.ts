import type { TableViewRowActionOptions } from "../table-view";
import type { RowActionConfig, RowActionRule } from "../types/row-action";

export function applyArchiveModeDefaultRules<T extends Record<string, unknown>>(
  rowActions: TableViewRowActionOptions<T> | undefined,
  archiveField: string,
): TableViewRowActionOptions<T> | undefined {
  const result: TableViewRowActionOptions<T> = { ...rowActions };

  const rules = {
    edit: { field: archiveField, notEquals: true },
    duplicate: { field: archiveField, notEquals: true },
    archive: { field: archiveField, notEquals: true },
    restore: { field: archiveField, equals: true },
    delete: { field: archiveField, equals: true },
  };

  for (const [action, defaultRule] of Object.entries(rules)) {
    // SAFETY: Object.entries enumerates the five own action names of the local rules literal.
    const actionKey = action as keyof typeof rules;
    const userConfig = rowActions?.[actionKey];

    if (userConfig === undefined) {
      result[actionKey] = {
        isEnabled: true,
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Public archiveField is any string, not a proven key of T; preserve the existing generated boolean rule contract.
        rule: defaultRule as RowActionRule<T>,
      } satisfies RowActionConfig<T>;
      continue;
    }

    if (
      userConfig === false ||
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve the published boolean-or-config input handling, including its existing runtime object distinction.
      (typeof userConfig === "object" && userConfig.isEnabled === false)
    ) {
      continue;
    }

    if (userConfig === true) {
      result[actionKey] = {
        isEnabled: true,
        // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Public archiveField is any string, not a proven key of T; preserve the existing generated boolean rule contract.
        rule: defaultRule as RowActionRule<T>,
      } satisfies RowActionConfig<T>;
      continue;
    }

    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve the published boolean-or-config input handling without introducing schema validation.
    if (typeof userConfig === "object") {
      result[actionKey] = {
        ...userConfig,
        rule: userConfig.rule
          ? // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Public archiveField is not proven to name a boolean field of T; retain the generated rule composition.
            { and: [defaultRule as RowActionRule<T>, userConfig.rule] }
          : // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Public archiveField is not proven to name a boolean field of T; retain the generated default rule.
            (defaultRule as RowActionRule<T>),
      } satisfies RowActionConfig<T>;
    }
  }

  return result;
}
