import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";
import type { Role, RoleModel } from "./db";
import { ApplyPermissionsResolvers } from "./permissions-resolver";

export interface Permission {
  id: string;
  title: string;
  icon?: string;
  description?: string;
  dependencies?: string[];
  defaultGranted?: boolean;
}

export type PermissionTree = {
  data?: Permission;
  children: Record<string, PermissionTree>;
};

/**
 * @internal
 */
export namespace internal {
  export const RegisterPermission = new RegisteringProxy<
    (id: string, permission: Permission) => void
  >();
}

export const RegisterPermission = (id: string, permission: Permission) => {
  internal.RegisterPermission.register(id, permission);
};

/**
 * Drop a permission from the grantable tree. Used when a registration is undone
 * while the process keeps running — a page extension whose module stopped.
 */
export const UnregisterPermission = (id: string) => {
  internal.RegisterPermission.unregister(id);
};

// Module access is platform-owner-only: permissions that belong to module
// pages/categories are never registered into the permission tree (Roles form)
// and must never grant anything to a non-owner, even when a stored role still
// references their id. Marking an id here also covers every dot-separated
// descendant id (components, actions), which are always built by suffixing
// the page or category permission id.
const moduleScopedPermissionIds = new Set<string>();

export function MarkModuleScopedPermission(id: string): void {
  moduleScopedPermissionIds.add(id);
}

export function UnmarkModuleScopedPermission(id: string): void {
  moduleScopedPermissionIds.delete(id);
}

export function IsModuleScopedPermission(id: string): boolean {
  let current = id;
  for (;;) {
    if (moduleScopedPermissionIds.has(current)) return true;
    const separatorIndex = current.lastIndexOf(".");
    if (separatorIndex <= 0) return false;
    current = current.slice(0, separatorIndex);
  }
}
export const GetPermission =
  InterfaceFunction<(id: string) => Permission | undefined>();
export const GetPermissions =
  InterfaceFunction<() => Record<string, PermissionTree>>();

/**
 * Compute the user's BASE permission set from role grants (or `*` for
 * platform owners). This set does not account for registered permissions
 * resolvers (e.g. plan gating): authorization surfaces must use
 * {@link GetEffectiveUserPermissions} instead so that every surface (guards,
 * menus, table views, search) agrees on the same effective set.
 */
export async function GetUserPermissions(
  user: { owner?: boolean },
  roleIds: string[],
  roleModel: RoleModel,
): Promise<Set<string>> {
  if (user.owner) {
    return new Set(["*"]);
  }
  if (roleIds.length === 0) {
    return new Set();
  }
  const roles = await roleModel.getBy("_id", ...roleIds);
  return new Set(roles.flatMap((role: Role) => role.permissions));
}

/**
 * Compute the user's EFFECTIVE permission set: base permissions from roles,
 * passed through every registered permissions resolver in ascending order.
 * This is the single entry point for authorization surfaces — route guards,
 * page/menu visibility, table-view action checks and search must all use it
 * so the UI and the API agree on what the user can do.
 *
 * Depends on the `dms/permissions-resolver` interface being implemented
 * (`ApplyPermissionsResolvers`): the dms module wires it in `construct()`.
 * In standalone contexts (unit tests, thin consumers) connect it manually
 * with `ImplementInterface`, otherwise the call queues until wired.
 */
export async function GetEffectiveUserPermissions(
  user: { _id: string; owner?: boolean },
  tenantId: string,
  roleIds: string[],
  roleModel: RoleModel,
): Promise<Set<string>> {
  const basePermissions = await GetUserPermissions(user, roleIds, roleModel);
  return ApplyPermissionsResolvers(user._id, tenantId, basePermissions);
}

export async function HasPermission(
  permissions: Set<string>,
  permissionId: string,
): Promise<boolean> {
  if (permissions.has("*")) return true;
  // Module permissions are owner-only regardless of role grants. This covers
  // the guards that funnel through HasPermission (route validator, table
  // actions); realtime page access short-circuits earlier via isInsideModule
  // in userCanAccessPage/computeEntryAccess (implementations/dms/page.ts).
  if (IsModuleScopedPermission(permissionId)) return false;
  const permission = await GetPermission(permissionId);
  return permissions.has(permissionId) || permission?.defaultGranted || false;
}
