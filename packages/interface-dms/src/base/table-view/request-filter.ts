// What one request is served of a table view's options: the actions, row
// actions and custom buttons the caller's permissions admit, with the rules
// the server enforces on them.
//
// Split out of factory-helpers.ts.

import { applyButtonAvailability } from "../button-availability";
import type { ComponentFilterContext } from "../../component";
import {
  holdsPermissionGate,
  type PermissionGate,
} from "../../permission-gate";
import { HasPermission } from "../../permissions";
import type {
  CustomButton,
  CustomButtonSerialized,
} from "../types/custom-button";
import type {
  CustomRowActionSerialized,
  RowActionConfigSerialized,
  RowActionRule,
} from "../types/row-action";
import type {
  TableViewRowActionOptions,
  TableViewRowActionOptionsSerialized,
} from "./options";
import { extractRuleFromConfig } from "./row-rules";

/** The table view actions whose permission shapes what a request is served. */
const GRANTED_ACTIONS = [
  "add",
  "edit",
  "delete",
  "view",
  "archive",
  "restore",
  "viewArchived",
  "export",
] as const;

/**
 * Whether the caller holds each table view action.
 *
 * @internal
 */
export type TableViewGrants = Record<(typeof GRANTED_ACTIONS)[number], boolean>;

/**
 * The table view actions the caller holds, checked one after the other.
 *
 * @internal
 */
export async function resolveTableViewGrants(
  permissions: Set<string>,
  permissionId: string,
): Promise<TableViewGrants> {
  const grants = {} as TableViewGrants;
  for (const action of GRANTED_ACTIONS) {
    grants[action] = await HasPermission(
      permissions,
      `${permissionId}.${action}`,
    );
  }
  return grants;
}

/**
 * A built-in row action as served to a caller: refused (`false`) without
 * the permission, on (`true`) when the table view left it unset.
 *
 * @internal
 */
export function applyPermissionToAction(
  hasPermission: boolean,
  actionConfig: boolean | RowActionConfigSerialized | undefined,
): boolean | RowActionConfigSerialized | undefined {
  if (!hasPermission) {
    return false;
  }
  return typeof actionConfig === "undefined" ? true : actionConfig;
}

/**
 * A built-in row action with the controller's rule, where the table view did
 * not declare its own: rules are registered once per controller (the writing
 * table view's) and enforced on every write, so the UI matches what the
 * server accepts.
 *
 * @internal
 */
export function mergeControllerRule(
  actionConfig: boolean | RowActionConfigSerialized | undefined,
  rule: RowActionRule | undefined,
): boolean | RowActionConfigSerialized | undefined {
  if (!rule || !actionConfig) {
    return actionConfig;
  }
  if (actionConfig === true) {
    return { isEnabled: true, rule };
  }
  if (!actionConfig.rule) {
    return { ...actionConfig, rule };
  }
  return actionConfig;
}

const CONTROLLER_RULED_ACTIONS = [
  "edit",
  "delete",
  "archive",
  "restore",
] as const;

/**
 * What the row actions of a table view are served from.
 *
 * @internal
 */
export interface RowActionsAdaptation {
  /** The row actions as the table view serialized them. */
  rowActions: TableViewRowActionOptionsSerialized | undefined;
  archiveMode: boolean | undefined;
  grants: TableViewGrants;
  /** The custom row actions already filtered for the request. */
  custom: CustomRowActionSerialized[] | undefined;
  /** The rules the data routes enforce (see `controllerRowActionRules`). */
  controllerRules: TableViewRowActionOptions | undefined;
}

/**
 * The row actions served to one request: each disabled when the caller lacks
 * its permission, the archive ones only in archive mode, and controller-wide
 * rules exposed where the table declared none. Details are dropped when edit
 * is offered unconditionally, since edit already shows the row.
 *
 * @internal
 */
export function adaptRowActions({
  rowActions,
  archiveMode,
  grants,
  custom,
  controllerRules,
}: RowActionsAdaptation): TableViewRowActionOptionsSerialized {
  const inArchiveMode = (
    granted: boolean,
    config: boolean | RowActionConfigSerialized | undefined,
  ) => (archiveMode ? applyPermissionToAction(granted, config) : undefined);

  const adapted: TableViewRowActionOptionsSerialized = {
    add: applyPermissionToAction(grants.add, rowActions?.add),
    edit: applyPermissionToAction(grants.edit, rowActions?.edit),
    duplicate: applyPermissionToAction(grants.add, rowActions?.duplicate),
    delete: applyPermissionToAction(grants.delete, rowActions?.delete),
    archive: inArchiveMode(grants.archive, rowActions?.archive),
    restore: inArchiveMode(grants.restore, rowActions?.restore),
    showArchived: archiveMode ? grants.viewArchived : undefined,
    details: applyPermissionToAction(grants.view, rowActions?.details),
    copyLink: applyPermissionToAction(grants.view, rowActions?.copyLink),
    hasSelection: rowActions?.hasSelection,
    custom,
  };

  // The table's own rules are already in its options; the controller's rule
  // applies where it declared none, as the routes enforce it.
  if (controllerRules) {
    for (const actionName of CONTROLLER_RULED_ACTIONS) {
      adapted[actionName] = mergeControllerRule(
        adapted[actionName],
        extractRuleFromConfig(controllerRules, actionName),
      );
    }
  }

  const editHasNoRules =
    adapted.edit === true ||
    (typeof adapted.edit === "object" && !adapted.edit.rule);
  if (editHasNoRules) {
    adapted.details = false;
  }
  return adapted;
}

/**
 * The custom buttons served to one request: those whose permission the caller
 * lacks are stripped, and those whose `availability` refuses the request are
 * disabled with its reason.
 *
 * @internal
 */
export async function resolveCustomButtons(
  permissions: Set<string>,
  declaredButtons: CustomButton[] | undefined,
  serializedButtons: CustomButtonSerialized[] | undefined,
  componentPermissionId: string,
  context: ComponentFilterContext,
): Promise<CustomButtonSerialized[] | undefined> {
  if (!declaredButtons || !serializedButtons) {
    return serializedButtons;
  }
  const kept: CustomButtonSerialized[] = [];
  for (const [index, serialized] of serializedButtons.entries()) {
    const declared = declaredButtons[index];
    if (
      !(await holdsPermissionGate(permissions, declared, componentPermissionId))
    ) {
      continue;
    }
    kept.push(
      await applyButtonAvailability(
        declared?.availability,
        serialized,
        context,
      ),
    );
  }
  return kept;
}

/**
 * The custom row actions served to one request: those whose `permission` the
 * caller lacks are stripped, like custom buttons.
 *
 * @internal
 */
export async function resolveCustomRowActions(
  permissions: Set<string>,
  declaredActions: PermissionGate[] | undefined,
  serializedActions: CustomRowActionSerialized[] | undefined,
  componentPermissionId: string,
): Promise<CustomRowActionSerialized[] | undefined> {
  if (!declaredActions || !serializedActions) return serializedActions;
  const kept: CustomRowActionSerialized[] = [];
  for (const [index, serialized] of serializedActions.entries()) {
    if (
      await holdsPermissionGate(
        permissions,
        declaredActions[index],
        componentPermissionId,
      )
    ) {
      kept.push(serialized);
    }
  }
  return kept;
}
