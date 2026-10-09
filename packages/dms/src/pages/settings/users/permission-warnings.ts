import type { Action } from "@antelopejs/interface-dms/component";
import type { InviteRoleOptions } from "./member-role-options";
import type { RoleEditorPermissionNode } from "./role-editor";

/**
 * What granting an action really allows, when that is more than its label
 * says: managing members, invitations or roles lets the holder lift
 * themselves to owner-level access. That is intended — whoever may open those
 * pages is trusted like an owner — so the roles editor warns about it instead
 * of the server refusing it.
 */
interface PermissionWarning {
  action: Action;
  /** i18n key of the warning. */
  warning: string;
}

const permissionWarnings: PermissionWarning[] = [];

/**
 * Declare the warning the roles editor shows on `action`, and on every role
 * whose permissions include it. Declared next to the action itself.
 */
export function declarePermissionWarning(
  action: Action,
  warning: string,
): void {
  permissionWarnings.push({ action, warning });
}

/**
 * The declared warnings by permission id. Resolved on each call: an action's
 * id is known once its page has registered.
 */
export function resolvePermissionWarnings(): Map<string, string> {
  return new Map(
    permissionWarnings.flatMap(({ action, warning }): [string, string][] => {
      const id = action.permissionId;
      return id ? [[id, warning]] : [];
    }),
  );
}

/**
 * The role options with the warnings of what each role grants, for the role
 * pickers to repeat when such a role is picked.
 */
export function applyRoleWarnings(
  options: InviteRoleOptions,
  warnings: ReadonlyMap<string, string>,
): InviteRoleOptions {
  return {
    ...options,
    roles: options.roles.map((role) => {
      const roleWarnings = [
        ...new Set(role.permissionIds.flatMap((id) => warnings.get(id) ?? [])),
      ];
      return roleWarnings.length > 0
        ? { ...role, warnings: roleWarnings }
        : role;
    }),
  };
}

/** The editor tree with the warning declared on each node, every level down. */
export function applyPermissionWarnings(
  nodes: RoleEditorPermissionNode[],
  warnings: ReadonlyMap<string, string>,
): RoleEditorPermissionNode[] {
  return nodes.map((node) => {
    const withWarning: RoleEditorPermissionNode = {
      ...node,
      children:
        node.children && applyPermissionWarnings(node.children, warnings),
    };
    const warning = warnings.get(node.id);
    if (warning) withWarning.warning = warning;
    return withWarning;
  });
}
