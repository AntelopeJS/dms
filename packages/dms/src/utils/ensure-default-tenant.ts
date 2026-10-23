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
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates the `default` tenant's row when it is missing.
 *
 * @returns Whether this call created it, which is when it has to be provisioned
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
 * Provisions the `default` tenant the current start just created. It has no
 * owner yet, so the payload carries no `userId`.
 *
 * A failure takes the row back before it propagates, like a signup that fails
 * takes its workspace with it: the next start creates the tenant again and
 * provisions it then, rather than leaving it without its default data.
 */
export async function provisionDefaultTenant(): Promise<void> {
  try {
    await ProvisionTenant({ tenantId: DEFAULT_TENANT_ID, extras: {} });
  } catch (error) {
    await GetModel(TenantModel).delete(DEFAULT_TENANT_ID);
    throw error;
  }
}
