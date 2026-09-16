import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";

export async function pickInitialTenantId(
  userId: string,
): Promise<string | undefined> {
  const memberModel = GetModel(TenantMemberModel, CROSS_INSTANCE);
  const oldest = await memberModel.getOldestByUser(userId);
  return oldest?.tenantId;
}
