import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  RoleModel,
  TenantMemberModel,
  TenantModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import {
  Hook,
  RegisterHook,
  type TenantDeletionContext,
} from "@antelopejs/interface-dms/hooks";
import { closeTenantLifecycleAdmission } from "@antelopejs/interface-dms/tenant-lifecycle";
import {
  emitAutomationEvent,
  listenersFor,
  type TenantDeletedEvent,
} from "../automation/events";
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

type TenantSnapshot = Pick<
  TenantDeletedEvent,
  "name" | "ownerUserId" | "ownerUserIds" | "ownerEmail"
>;

async function snapshotTenant(tenantId: string): Promise<TenantSnapshot> {
  const snapshot: TenantSnapshot = { ownerUserIds: [] };
  try {
    const tenant = await GetModel(TenantModel).get(tenantId);
    if (tenant?.name) snapshot.name = tenant.name;
    const owners = await GetModel(TenantMemberModel, tenantId).listOwners();
    owners.sort(
      (left, right) =>
        new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime(),
    );
    snapshot.ownerUserIds = owners.map((owner) => owner.userId);
    const [ownerUserId] = snapshot.ownerUserIds;
    if (ownerUserId) {
      snapshot.ownerUserId = ownerUserId;
      const owner = await GetModel(UserModel).get(ownerUserId);
      if (owner?.email) snapshot.ownerEmail = owner.email;
    }
  } catch (error) {
    Logging.Warn(
      `[dms] tenant-deleted snapshot failed for tenant '${tenantId}':`,
      error,
    );
  }
  return snapshot;
}

function announceTenantDeleted(
  tenantId: string,
  snapshot: TenantSnapshot,
  context: TenantDeletionContext | undefined,
): void {
  const event: TenantDeletedEvent = {
    tenantId,
    ...snapshot,
    deliveryId: context?.operationId ?? `tenant-deleted:${tenantId}`,
    at: new Date().toISOString(),
  };
  if (context?.operationId) event.operationId = context.operationId;
  emitAutomationEvent("dms.tenant-deleted", event);
}

export function registerTenantDeletedCleanup(): void {
  RegisterHook(
    Hook.TENANT_DELETED,
    async (tenantId: string, context?: TenantDeletionContext) => {
      const announced = listenersFor("dms.tenant-deleted").size > 0;
      const snapshot = announced ? await snapshotTenant(tenantId) : undefined;
      try {
        await cleanupTenantData(tenantId);
      } catch (error) {
        Logging.Error(
          `[dms] tenant-deleted cleanup failed for tenant '${tenantId}':`,
          error,
        );
        throw error;
      }
      if (snapshot) announceTenantDeleted(tenantId, snapshot, context);
      return undefined;
    },
  );
}
