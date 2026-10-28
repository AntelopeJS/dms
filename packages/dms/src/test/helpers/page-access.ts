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
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";

export interface PageAccessModels {
  memberModel: TenantMemberModel;
  roleModel: RoleModel;
}

/**
 * Minimal member/role models for the page-visibility unit tests: the member
 * always belongs to one role, and that role grants `grantedPermissions` as the
 * role routes store them, with every id they sit under.
 */
export function stubPageAccessModels(
  grantedPermissions: string[],
): PageAccessModels {
  return stubExactPermissionModels(withPermissionAncestors(grantedPermissions));
}

/**
 * Like {@link stubPageAccessModels}, but the role grants exactly `permissions`:
 * a role saved before the role routes completed its permissions.
 */
export function stubExactPermissionModels(
  permissions: string[],
): PageAccessModels {
  // SAFETY: Page visibility only calls getByUser for roleIds and getBy for permissions; neither stub implements unrelated model operations or row fields.
  return {
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Inference and Pick preserve the partial row return, which cannot implement the model's complete member return contract.
    memberModel: {
      getByUser: async () => ({ roleIds: ["role-1"] }),
    } as unknown as TenantMemberModel,
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Inference and Pick preserve the partial row return, which cannot implement the model's complete role return contract.
    roleModel: {
      getBy: async () => [{ permissions }],
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
