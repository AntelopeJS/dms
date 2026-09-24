import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  RoleModel,
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { Hook } from "@antelopejs/interface-dms/hooks";
import { closeTenantLifecycleAdmission } from "@antelopejs/interface-dms/tenant-lifecycle";
import { deleteAllExportsForTenant } from "../utils";
import { dmsHooks } from "./owned-hooks";

async function deleteAllRowsForTenant(
  modelClass: Parameters<typeof GetModel>[0],
  tenantId: string,
): Promise<void> {
  const scopedModel = GetModel(modelClass, tenantId);
  await scopedModel.table.delete().run();
}

async function cleanupTenantData(tenantId: string): Promise<void> {
  await closeTenantLifecycleAdmission(tenantId);
  await deleteAllRowsForTenant(TenantMemberModel, tenantId);
  await deleteAllRowsForTenant(UserInviteModel, tenantId);
  await deleteAllRowsForTenant(RoleModel, tenantId);
  await deleteAllExportsForTenant(tenantId);
}

export function registerTenantDeletedCleanup(): void {
  dmsHooks.register(Hook.TENANT_DELETED, async (tenantId: string) => {
    try {
      await cleanupTenantData(tenantId);
    } catch (error) {
      Logging.Error(
        `[dms] tenant-deleted cleanup failed for tenant '${tenantId}':`,
        error,
      );
      throw error;
    }
    return undefined;
  });
}
