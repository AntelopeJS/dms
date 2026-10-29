import { assert } from "chai";
import type {
  RoleModel,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import {
  GetPageLayoutBySlug,
  type PageLayout,
} from "@antelopejs/interface-dms/page";
import { withPermissionAncestors } from "@antelopejs/interface-dms/internal/permission-ids";
import type { User } from "@antelopejs/interface-dms/auth/db";

export interface LayoutCaller {
  user: User | undefined;
  memberModel: TenantMemberModel;
  roleModel: RoleModel;
}

// SAFETY: Anonymous layout access queries neither memberships nor roles, so the empty models are never called.
export const ANONYMOUS: LayoutCaller = {
  user: undefined,
  memberModel: {} as TenantMemberModel,
  roleModel: {} as RoleModel,
};

export function grantedTo(permissions: string[]): LayoutCaller {
  // SAFETY: Permission lookup reads only the user id and owner flag (absent here, so the caller is not a platform owner), the member row's role ids and the role rows' permissions; the stubs implement just those reads.
  return {
    user: { _id: "pe-user" } as User,
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Inference and Pick expose a partial member row; authorization only reads its role ids.
    memberModel: {
      getByUser: async () => ({ roleIds: ["pe-role"] }),
    } as unknown as TenantMemberModel,
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Inference and Pick expose partial role rows; authorization only reads their permissions.
    roleModel: {
      getBy: async () => [
        { permissions: withPermissionAncestors(permissions) },
      ],
    } as unknown as RoleModel,
  };
}

export async function loadLayout(
  fullSlug: string,
  caller = ANONYMOUS,
): Promise<PageLayout> {
  const handler = GetPageLayoutBySlug(fullSlug);
  assert.isDefined(handler, `no layout handler registered for ${fullSlug}`);
  return handler({
    user: caller.user,
    memberModel: caller.memberModel,
    roleModel: caller.roleModel,
    tenantId: "pe-tenant",
  });
}

export async function layoutKeys(
  fullSlug: string,
  caller = ANONYMOUS,
): Promise<string[]> {
  return Object.keys((await loadLayout(fullSlug, caller)).components);
}

export async function layoutChildIds(
  fullSlug: string,
  rootKey: string,
): Promise<string[]> {
  const handler = GetPageLayoutBySlug(fullSlug);
  assert.isDefined(handler, `no layout handler registered for ${fullSlug}`);
  const layout = await handler({
    user: ANONYMOUS.user,
    memberModel: ANONYMOUS.memberModel,
    roleModel: ANONYMOUS.roleModel,
    tenantId: "pe-tenant",
  });
  return layout.components[rootKey]?.children?.map((child) => child.id) ?? [];
}
