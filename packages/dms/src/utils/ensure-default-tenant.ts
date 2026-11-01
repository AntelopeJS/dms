import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
} from "@antelopejs/interface-dms/constants";
import { type Tenant, TenantModel } from "@antelopejs/interface-dms/db";
import { ProvisionTenant } from "@antelopejs/interface-dms/tenant-provisioning";

function buildDefaultTenant(): Partial<Tenant> {
  const now = new Date();
  return {
    _id: DEFAULT_TENANT_ID,
    name: DEFAULT_TENANT_NAME,
    provisioningPending: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates the `default` tenant's row with provisioning pending when missing.
 * Existing rows are left unchanged, including a pending provisioning attempt.
 *
 * @returns Whether this call created the row, not whether provisioning is pending
 */
export async function ensureDefaultTenantExists(): Promise<boolean> {
  const tenants = GetModel(TenantModel);
  const existing = await tenants.get(DEFAULT_TENANT_ID);
  if (existing) {
    Logging.Info(`Default tenant '${DEFAULT_TENANT_ID}' already exists.`);
    return false;
  }

  await tenants.insert(buildDefaultTenant());
  Logging.Info(`Default tenant '${DEFAULT_TENANT_ID}' created.`);
  return true;
}

/**
 * Provisions the `default` tenant only when its row marks provisioning pending.
 * It has no owner yet, so the payload carries no `userId`.
 *
 * Clears the marker only after every provisioning handler resolves. A failure
 * is logged and leaves the row pending for the next attempt. Legacy rows with
 * no marker are already provisioned and are not run again.
 */
export async function provisionDefaultTenant(): Promise<void> {
  try {
    const tenants = GetModel(TenantModel);
    const tenant = await tenants.get(DEFAULT_TENANT_ID);
    if (!tenant?.provisioningPending) return;

    await ProvisionTenant({ tenantId: DEFAULT_TENANT_ID, extras: {} });
    await tenants.update(DEFAULT_TENANT_ID, { provisioningPending: false });
  } catch (error) {
    Logging.Error(
      `Default tenant '${DEFAULT_TENANT_ID}' provisioning failed:`,
      error,
    );
  }
}
