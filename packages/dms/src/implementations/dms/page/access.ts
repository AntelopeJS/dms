import {
  pagesBySlug,
  resolvePagePermissionId,
  WILDCARD_PERMISSION,
  getRoleIdsForUser,
  isPlatformPage as isPlatformPageHelper,
  userCanAccessPage as userCanAccessPageHelper,
} from "../../../utils";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { TenantMemberModel, RoleModel } from "@antelopejs/interface-dms/db";
import {
  GetEffectiveUserPermissions,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import { CheckTenantAccess } from "@antelopejs/interface-dms/tenant-access";
import { gateAllowsSurface } from "@antelopejs/interface-dms/internal/tenant-access";
import { isInsideModule } from "@antelopejs/interface-dms/page";
import { categoriesByFullId } from "./state";
import type {
  RequestAccessContext,
  AccessContext,
  NavigationEntry,
} from "./types";

/**
 * Whether `fullId` is a platform page: a module's, owner-only, listing the
 * data of every tenant.
 */
export function isPlatformPage(fullId: string): boolean {
  return isPlatformPageHelper(fullId);
}

export async function userCanAccessPage(
  user: User | undefined,
  fullId: string,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
): Promise<boolean> {
  return userCanAccessPageHelper(
    user,
    fullId,
    memberModel,
    roleModel,
    tenantId,
  );
}

export function redactPresentation<T extends NavigationEntry>(entry: T): T {
  return {
    ...entry,
    displayName: "",
    description: undefined,
    icon: undefined,
    permission: undefined,
  };
}

export function collectSurfaceBypassFlags(): Map<string, boolean> {
  const flags = new Map<string, boolean>();
  const entries = [
    ...Object.values(categoriesByFullId),
    ...Object.values(pagesBySlug),
  ];
  for (const entry of entries) {
    const id = resolvePagePermissionId(entry.permission, entry.fullId);
    const bypassed = entry.bypassTenantAccessGate === true;
    flags.set(id, (flags.get(id) ?? true) && bypassed);
  }
  return flags;
}

export function isBypassedPermission(
  permissionId: string,
  surfaces: Map<string, boolean>,
): boolean {
  let current = permissionId;
  for (;;) {
    const bypassed = surfaces.get(current);
    if (bypassed !== undefined) return bypassed;
    const separatorIndex = current.lastIndexOf(".");
    if (separatorIndex <= 0) return false;
    current = current.slice(0, separatorIndex);
  }
}

/**
 * Client permissions for bypass surfaces and their components while a tenant
 * gate denies access. Keeps the wildcard only when a bypass surface exists.
 * Server authorization on other routes remains unchanged.
 *
 * @param surfaces Bypass flag of every registered permission id, from
 * `collectSurfaceBypassFlags`.
 */
export function filterPermissionsForBypassedSurfaces(
  permissions: Set<string>,
  surfaces: Map<string, boolean>,
): Set<string> {
  const hasBypassedSurface = [...surfaces.values()].some(Boolean);
  if (!hasBypassedSurface) {
    return new Set();
  }
  if (permissions.has(WILDCARD_PERMISSION)) {
    return new Set([WILDCARD_PERMISSION]);
  }
  return new Set(
    [...permissions].filter((id) => isBypassedPermission(id, surfaces)),
  );
}

export async function resolveUserPermissions(
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
): Promise<string[]> {
  const context = await buildAccessContext(
    user,
    memberModel,
    roleModel,
    tenantId,
  );
  return [...context.client.permissions];
}

/**
 * Whether the caller is a platform owner, the same test `modules-listing`
 * applies: a tenant access gate that denies the tenant denies it too.
 */
export async function isPlatformOwner(
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
): Promise<boolean> {
  const context = await buildAccessContext(
    user,
    memberModel,
    roleModel,
    tenantId,
  );
  return context.gated.isOwner;
}

export async function buildAccessContext(
  user: User | undefined,
  memberModel: TenantMemberModel,
  roleModel: RoleModel,
  tenantId: string,
): Promise<RequestAccessContext> {
  const isAuthenticated = !!user;
  if (!user) {
    const anonymous: AccessContext = {
      permissions: new Set(),
      isOwner: false,
      isAuthenticated,
    };
    return {
      gated: anonymous,
      ungated: anonymous,
      client: anonymous,
      gateDenied: false,
      entryAccess: new Map(),
    };
  }
  const roleIds = await getRoleIdsForUser(memberModel, user);
  const permissions = await GetEffectiveUserPermissions(
    user,
    tenantId,
    roleIds,
    roleModel,
  );
  const ungated: AccessContext = {
    permissions,
    isOwner: permissions.has(WILDCARD_PERMISSION),
    isAuthenticated,
  };

  const access = await CheckTenantAccess(user._id, tenantId);
  if (access.allowed) {
    return {
      gated: ungated,
      ungated,
      client: ungated,
      gateDenied: false,
      entryAccess: new Map(),
    };
  }
  return buildDeniedAccessContext(ungated);
}

export function buildDeniedAccessContext(
  ungated: AccessContext,
): RequestAccessContext {
  const { isAuthenticated } = ungated;
  const clientPermissions = filterPermissionsForBypassedSurfaces(
    ungated.permissions,
    collectSurfaceBypassFlags(),
  );
  return {
    gated: { permissions: new Set(), isOwner: false, isAuthenticated },
    ungated,
    client: {
      permissions: clientPermissions,
      isOwner: clientPermissions.has(WILDCARD_PERMISSION),
      isAuthenticated,
    },
    gateDenied: true,
    entryAccess: new Map(),
  };
}

export function selectEntryContext(
  entry: NavigationEntry,
  context: RequestAccessContext,
): AccessContext {
  return entry.bypassTenantAccessGate === true
    ? context.ungated
    : context.gated;
}

export async function computeEntryAccess(
  entry: NavigationEntry,
  context: RequestAccessContext,
): Promise<boolean> {
  const cacheKey = entry.fullId;
  const cached = context.entryAccess.get(cacheKey);
  if (cached) return cached;
  const result = computeEntryAccessUncached(entry, context);
  context.entryAccess.set(cacheKey, result);
  return result;
}

export async function computeEntryAccessUncached(
  entry: NavigationEntry,
  context: RequestAccessContext,
): Promise<boolean> {
  if (!gateAllowsSurface(entry, context.gateDenied)) return false;
  const effective = selectEntryContext(entry, context);
  if (effective.isOwner) return true;
  if (isInsideModule(entry)) return false;
  if (entry.authOnly === true) return effective.isAuthenticated;
  if (effective.isAuthenticated) {
    if (context.gateDenied && entry.bypassTenantAccessGate !== true) {
      return entry.publicAccess === true;
    }
    return HasPermission(
      effective.permissions,
      resolvePagePermissionId(entry.permission, entry.fullId),
    );
  }
  return entry.publicAccess === true;
}
