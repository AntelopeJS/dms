// What one request is served of a table view's options: the actions, row
// actions and custom buttons the caller's permissions admit, with the rules
// the server enforces on them.
//
// Split out of factory-helpers.ts.

import { Logging } from "@antelopejs/interface-core/logging";
import {
  type ButtonPermission,
  type ComponentFilterContext,
  resolveButtonPermissionId,
} from "../../component";
import { HasPermission } from "../../permissions";
import type {
  CustomButton,
  CustomButtonSerialized,
} from "../types/custom-button";
import type {
  CustomRowAction,
  CustomRowActionSerialized,
  RowActionConfig,
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

/** Whether the caller holds each table view action. */
export type TableViewGrants = Record<(typeof GRANTED_ACTIONS)[number], boolean>;

/** The table view actions the caller holds, checked one after the other. */
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

export function applyPermissionToAction(
  hasPermission: boolean,
  actionConfig: boolean | RowActionConfig | undefined,
): boolean | RowActionConfig | undefined {
  if (!hasPermission) {
    return false;
  }
  return typeof actionConfig === "undefined" ? true : actionConfig;
}

// Row action rules are registered once per controller but enforced server-side
// for every table view on that controller; expose them to pages that did not
// declare their own rule so their UI matches what the server will accept.
export function mergeControllerRule(
  actionConfig: boolean | RowActionConfig | undefined,
  rule: RowActionRule | undefined,
): boolean | RowActionConfig | undefined {
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

/** What the row actions of a table view are served from. */
export interface RowActionsAdaptation {
  /** The row actions as the table view serialized them. */
  rowActions: TableViewRowActionOptionsSerialized | undefined;
  archiveMode: boolean | undefined;
  grants: TableViewGrants;
  /** The custom row actions already filtered for the request. */
  custom: CustomRowActionSerialized[] | undefined;
  /** Controller-wide rules, set explicitly, applied on top. */
  controllerRules: TableViewRowActionOptions | undefined;
}

/**
 * The row actions served to one request: each disabled when the caller lacks
 * its permission, the archive ones only in archive mode, and controller-wide
 * rules exposed where the table declared none. Details are dropped when edit
 * is offered unconditionally, since edit already shows the row.
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
    config: boolean | RowActionConfig | undefined,
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

  // The table's own rules are already in its options; a controller-wide
  // rule (set explicitly) applies on top, as the routes enforce it.
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

// A declared permission that cannot be resolved to an id (e.g. an action on a
// page that never registered) fails closed.
async function isCustomButtonGranted(
  permissions: Set<string>,
  declared: { permission?: ButtonPermission } | undefined,
  componentPermissionId: string,
): Promise<boolean> {
  if (declared?.permission === undefined) return true;
  const permissionId = resolveButtonPermissionId(
    declared.permission,
    componentPermissionId,
  );
  return !!permissionId && (await HasPermission(permissions, permissionId));
}

// A resolver that throws leaves the button enabled: the operation behind it
// still refuses on its own, and failing the layout would take the page down.
async function applyCustomButtonAvailability(
  declared: CustomButton | undefined,
  serialized: CustomButtonSerialized,
  context: ComponentFilterContext,
): Promise<CustomButtonSerialized> {
  if (!declared?.availability) return serialized;
  try {
    const unavailability = await declared.availability(context);
    if (!unavailability) return serialized;
    return {
      ...serialized,
      disabled: true,
      disabledReason: unavailability.reason,
    };
  } catch (error) {
    Logging.Error(
      `[dms] availability of button "${serialized.id ?? serialized.label}" could not be resolved:`,
      error,
    );
    return serialized;
  }
}

/**
 * The custom buttons served to one request: those whose permission the caller
 * lacks are stripped, and those whose `availability` refuses the request are
 * disabled with its reason.
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
      !(await isCustomButtonGranted(
        permissions,
        declared,
        componentPermissionId,
      ))
    ) {
      continue;
    }
    kept.push(
      await applyCustomButtonAvailability(declared, serialized, context),
    );
  }
  return kept;
}

/**
 * The custom row actions served to one request: those whose `permission` the
 * caller lacks are stripped, like custom buttons.
 */
export async function resolveCustomRowActions(
  permissions: Set<string>,
  declaredActions: Array<Pick<CustomRowAction, "permission">> | undefined,
  serializedActions: CustomRowActionSerialized[] | undefined,
  componentPermissionId: string,
): Promise<CustomRowActionSerialized[] | undefined> {
  if (!declaredActions || !serializedActions) return serializedActions;
  const kept: CustomRowActionSerialized[] = [];
  for (const [index, serialized] of serializedActions.entries()) {
    if (
      await isCustomButtonGranted(
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
