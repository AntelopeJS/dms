import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { TenantMemberModel, TenantModel } from "@antelopejs/interface-dms/db";
import type { TenantDeletionContext } from "@antelopejs/interface-dms/hooks";
import {
  emitAutomationEvent,
  listenersFor,
  type TenantDeletedEvent,
} from "./events";

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

/**
 * Reads what `dms.tenant-deleted` reports about a tenant before its data is
 * deleted, and hands back the emit to run once the deletion succeeded.
 * Resolves with nothing while no trigger listens.
 */
export async function observeTenantDeletion(
  tenantId: string,
  context: TenantDeletionContext | undefined,
): Promise<(() => void) | undefined> {
  if (listenersFor("dms.tenant-deleted").size === 0) return undefined;
  const snapshot = await snapshotTenant(tenantId);
  return () => announceTenantDeleted(tenantId, snapshot, context);
}
