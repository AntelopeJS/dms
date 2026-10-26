import { expect } from "chai";
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

export const ANONYMOUS: LayoutCaller = {
  user: undefined,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Anonymous layout access does not query memberships; this empty model intentionally has no database behavior.
  memberModel: {} as TenantMemberModel,
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Anonymous layout access does not query roles; this empty model intentionally has no database behavior.
  roleModel: {} as RoleModel,
};

export function grantedTo(permissions: string[]): LayoutCaller {
  return {
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Permission lookup reads only the id; the fixture is not a complete persisted user.
    user: { _id: "pe-user" } as User,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-chained-type-assertions -- Inference and Pick expose a partial member row; authorization only reads its role ids.
    memberModel: {
      getByUser: async () => ({ roleIds: ["pe-role"] }),
    } as unknown as TenantMemberModel,
    // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-chained-type-assertions -- Inference and Pick expose partial role rows; authorization only reads their permissions.
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
  expect(handler, `no layout handler registered for ${fullSlug}`).to.not.equal(
    undefined,
  );
  // SAFETY: The preceding assertion throws unless the optional handler exists.
  return (handler as NonNullable<typeof handler>)({
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
  expect(handler, `no layout handler registered for ${fullSlug}`).to.not.equal(
    undefined,
  );
  // SAFETY: The preceding assertion throws unless the optional handler exists.
  const layout = await (handler as NonNullable<typeof handler>)({
    user: ANONYMOUS.user,
    memberModel: ANONYMOUS.memberModel,
    roleModel: ANONYMOUS.roleModel,
    tenantId: "pe-tenant",
  });
  return layout.components[rootKey]?.children?.map((child) => child.id) ?? [];
}
