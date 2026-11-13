import { Action } from "@antelopejs/interface-dms/component";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  isInsideModule,
  isOwnerOnly,
  type PageInfo,
} from "@antelopejs/interface-dms/page";
import {
  GetEffectiveUserPermissions,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import { CheckTenantAccess } from "@antelopejs/interface-dms/tenant-access";
import { gateAllowsSurface } from "@antelopejs/interface-dms/internal/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";

export const pagesBySlug: Record<string, PageInfo> = {};

export function resolvePagePermissionId(
  permission: PageInfo["permission"],
  fullId: string,
): string {
  if (permission instanceof Action) {
    return permission.permissionId ?? fullId;
  }
  return permission?.id || fullId;
}

export function findEntryByFullId<T extends { fullId: string }>(
  registry: Record<string, T>,
  fullId: string,
): T | undefined {
  return Object.values(registry).find((entry) => entry.fullId === fullId);
}

export function findPageByFullId(fullId: string): PageInfo | undefined {
  return findEntryByFullId(pagesBySlug, fullId);
}

/**
 * Whether `fullId` is a platform page: a module's, owner-only, listing the
 * data of every tenant.
 */
export function isPlatformPage(fullId: string): boolean {
  const info = findPageByFullId(fullId);
  return info !== undefined && isInsideModule(info);
}

export async function userCanAccessPage(
  user: User | undefined,
  fullId: string,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
): Promise<boolean> {
  const info = findPageByFullId(fullId);
  if (!info) return false;

  if (!user) return !isOwnerOnly(info) && info.publicAccess === true;
  const access = await CheckTenantAccess(user._id, tenantId);

  if (!gateAllowsSurface(info, !access.allowed)) return false;
  const roleIds = await getRoleIdsForUser(memberModel, user);
  const permissions = await GetEffectiveUserPermissions(
    user,
    tenantId,
    roleIds,
    roleModel,
  );
  return permissionsOpenPage(info, {
    permissions,
    isOwner: user.owner === true,
  });
}

/**
 * Whether a signed-in member opens the page, once the tenant gate let them
 * through: the rule {@link userCanAccessPage} ends on. `isOwner` is the
 * member's `user.owner` flag: the platform owner opens every page.
 */
export async function permissionsOpenPage(
  info: PageInfo,
  { permissions, isOwner }: { permissions: Set<string>; isOwner: boolean },
): Promise<boolean> {
  if (isOwner) return true;
  if (isOwnerOnly(info)) return false;
  if (info.authOnly) return true;
  return HasPermission(
    permissions,
    resolvePagePermissionId(info.permission, info.fullId),
  );
}

export const WILDCARD_PERMISSION = "*";

export async function getRoleIdsForUser(
  memberModel: TenantMemberModel,
  user: User,
): Promise<string[]> {
  const member = await memberModel.getByUser(user._id);
  return member?.roleIds ?? [];
}
