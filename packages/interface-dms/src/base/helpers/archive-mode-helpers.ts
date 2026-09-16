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
    const actionKey = action as keyof typeof rules;
    const userConfig = rowActions?.[actionKey];

    if (userConfig === undefined) {
      result[actionKey] = {
        isEnabled: true,
        rule: defaultRule as RowActionRule<T>,
      } satisfies RowActionConfig<T>;
      continue;
    }

    if (
      userConfig === false ||
      (typeof userConfig === "object" && userConfig.isEnabled === false)
    ) {
      continue;
    }

    if (userConfig === true) {
      result[actionKey] = {
        isEnabled: true,
        rule: defaultRule as RowActionRule<T>,
      } satisfies RowActionConfig<T>;
      continue;
    }

    if (typeof userConfig === "object" && !userConfig.rule) {
      result[actionKey] = {
        ...userConfig,
        rule: defaultRule as RowActionRule<T>,
      } satisfies RowActionConfig<T>;
    }
  }

  return result;
}
