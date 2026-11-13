import type { TableViewRowActionOptions } from "../table-view";
import type { RowActionConfig, RowActionRule } from "../types/row-action";
import { isObject } from "../../utils/internal/type-check";

type ArchiveModeAction =
  | "edit"
  | "duplicate"
  | "archive"
  | "restore"
  | "delete";

export function applyArchiveModeDefaultRules<T extends object>(
  rowActions: TableViewRowActionOptions<T> | undefined,
  archiveField: string,
): TableViewRowActionOptions<T> | undefined {
  const result: TableViewRowActionOptions<T> = { ...rowActions };

  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Public archiveField is any string, not a proven key of T; preserve the existing generated boolean rule contract.
  const rules = [
    ["edit", { field: archiveField, notEquals: true }],
    ["duplicate", { field: archiveField, notEquals: true }],
    ["archive", { field: archiveField, notEquals: true }],
    ["restore", { field: archiveField, equals: true }],
    ["delete", { field: archiveField, equals: true }],
  ] as Array<[ArchiveModeAction, RowActionRule<T>]>;

  for (const [actionKey, defaultRule] of rules) {
    const userConfig = rowActions?.[actionKey];

    if (userConfig === undefined) {
      result[actionKey] = {
        isEnabled: true,
        rule: defaultRule,
      } satisfies RowActionConfig<T>;
      continue;
    }

    if (
      userConfig === false ||
      (isObject(userConfig) && userConfig.isEnabled === false)
    ) {
      continue;
    }

    if (userConfig === true) {
      result[actionKey] = {
        isEnabled: true,
        rule: defaultRule,
      } satisfies RowActionConfig<T>;
      continue;
    }

    if (isObject(userConfig)) {
      result[actionKey] = {
        ...userConfig,
        rule: userConfig.rule
          ? { and: [defaultRule, userConfig.rule] }
          : defaultRule,
      } satisfies RowActionConfig<T>;
    }
  }

  return result;
}
