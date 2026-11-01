import { assert } from "chai";
import type {
  RoleModel,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import {
  GetPageLayoutBySlug,
  type PageLayout,
} from "@antelopejs/interface-dms/page";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { stubPageAccessModels } from "./page-access";
import { userFixture } from "./user-fixture";

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
  const { memberModel, roleModel } = stubPageAccessModels(permissions);
  return { user: userFixture({ _id: "pe-user" }), memberModel, roleModel };
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
