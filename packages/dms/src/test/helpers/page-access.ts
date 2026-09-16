// The two model doubles below implement only `getByUser` and `getBy`, the pair
// every page-access case calls. Neither structurally satisfies its model type,
// so the chain is how a partial double reaches it; building full instances
// would test the instance.
/* oxlint-disable anti-slop/no-chained-type-assertions */
import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type {
  RoleModel,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import {
  Category,
  type CategoryInfo,
  type MenuOptions,
  PageMetadata,
  internal as pageInterfaceInternal,
} from "@antelopejs/interface-dms/page";
import type { TenantAccessGateInfo } from "@antelopejs/interface-dms/tenant-access";

export interface PageAccessModels {
  memberModel: TenantMemberModel;
  roleModel: RoleModel;
}

/**
 * Minimal member/role models for the page-visibility unit tests: the member
 * always belongs to one role, and that role grants exactly `grantedPermissions`.
 */
export function stubPageAccessModels(
  grantedPermissions: string[],
): PageAccessModels {
  return {
    memberModel: {
      getByUser: async () => ({ roleIds: ["role-1"] }),
    } as unknown as TenantMemberModel,
    roleModel: {
      getBy: async () => [{ permissions: grantedPermissions }],
    } as unknown as RoleModel,
  };
}

/**
 * Register a page controller and return the callback removing it again, for
 * the tests that must not leave their fixture in the shared page registry.
 */
export async function registerTestPage(
  controller: ControllerClass,
): Promise<() => void> {
  const meta = GetMetadata(controller, PageMetadata);
  await meta.Register();
  const { pageInfo } = meta;
  if (!pageInfo) {
    throw new Error("PageMetadata was not initialized");
  }
  return () => pageInterfaceInternal.RegisterPage.unregister(pageInfo);
}

export interface TestCategory {
  category: CategoryInfo;
  cleanup: () => void;
}

/**
 * Register a category and return it with the callback removing it again. The
 * page registry is shared by every suite of the run, so a fixture that outlives
 * its suite would leak into the next one.
 */
export function registerTestCategory(
  id: string,
  options: MenuOptions,
): TestCategory {
  const category = Category(id, options);
  return {
    category,
    cleanup: () => pageInterfaceInternal.RegisterCategory.unregister(category),
  };
}

/**
 * A tenant access gate denying one tenant, for the tests around
 * `bypassTenantAccessGate`. Register and unregister it with the same object.
 */
export function denyingTenantGate(
  id: string,
  deniedTenantId: string,
  code = `${id}.denied`,
): TenantAccessGateInfo {
  return {
    id,
    order: 0,
    gate: (_userId, tenantId) =>
      tenantId === deniedTenantId
        ? { allowed: false, code }
        : { allowed: true },
  };
}
