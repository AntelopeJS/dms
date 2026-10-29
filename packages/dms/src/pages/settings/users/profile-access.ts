import { GetModel } from "@antelopejs/interface-database-decorators";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { roleNamesOf } from "./account-data-store";

export interface ProfileAccess {
  /** Names of the roles held in the current workspace. */
  roles: string[];
  workspaceOwner: boolean;
  /** Platform owners hold every permission, whatever their roles. */
  platformOwner: boolean;
}

export async function loadProfileAccess(
  user: User,
  tenantId: string,
): Promise<ProfileAccess> {
  const member = await GetModel(TenantMemberModel, tenantId).getByUser(
    user._id,
  );
  return {
    roles: await roleNamesOf(tenantId, member?.roleIds ?? []),
    workspaceOwner: member?.isTenantOwner === true,
    platformOwner: user.owner === true,
  };
}
