import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  RoleModel,
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import {
  Hook,
  RegisterHook,
  type TenantDeletionContext,
} from "@antelopejs/interface-dms/hooks";
import { closeTenantLifecycleAdmission } from "@antelopejs/interface-dms/tenant-lifecycle";
import { deleteAllExportsForTenant } from "../utils";

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

/**
 * Called before a tenant's data is deleted; the callback it may resolve with
 * runs once the deletion succeeded.
 */
export type TenantDeletionObserver = (
  tenantId: string,
  context: TenantDeletionContext | undefined,
) => Promise<(() => void) | undefined>;

export function registerTenantDeletedCleanup(
  observe?: TenantDeletionObserver,
): void {
  RegisterHook(
    Hook.TENANT_DELETED,
    async (tenantId: string, context?: TenantDeletionContext) => {
      const announce = observe ? await observe(tenantId, context) : undefined;
      try {
        await cleanupTenantData(tenantId);
      } catch (error) {
        Logging.Error(
          `[dms] tenant-deleted cleanup failed for tenant '${tenantId}':`,
          error,
        );
        throw error;
      }
      announce?.();
      return undefined;
    },
  );
}
