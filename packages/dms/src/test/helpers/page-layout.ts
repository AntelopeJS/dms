import { assert } from "chai";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
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

class UnqueriedMemberModel extends TenantMemberModel {
  override async getByUser(): Promise<never> {
    throw new Error("Anonymous layout access queried memberships");
  }
}

class UnqueriedRoleModel extends RoleModel {
  override async getBy(): Promise<never> {
    throw new Error("Anonymous layout access queried roles");
  }
}

/**
 * A caller with no user. Its real models reject every membership and role
 * lookup, because anonymous layout access queries neither.
 */
export const ANONYMOUS: LayoutCaller = {
  user: undefined,
  memberModel: new UnqueriedMemberModel(
    GetModel(TenantMemberModel, DEFAULT_TENANT_ID).database,
  ),
  roleModel: new UnqueriedRoleModel(
    GetModel(RoleModel, DEFAULT_TENANT_ID).database,
  ),
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
