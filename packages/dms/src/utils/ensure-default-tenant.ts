import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
} from "@antelopejs/interface-dms/constants";
import { type Tenant, TenantModel } from "@antelopejs/interface-dms/db";

function buildDefaultTenant(): Partial<Tenant> {
  const now = new Date();
  return {
    _id: DEFAULT_TENANT_ID,
    name: DEFAULT_TENANT_NAME,
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureDefaultTenantExists(): Promise<void> {
  const tenants = GetModel(TenantModel);
  const existing = await tenants.get(DEFAULT_TENANT_ID);
  if (existing) {
    Logging.Info(`Default tenant '${DEFAULT_TENANT_ID}' already exists.`);
    return;
  }

  await tenants.insert(buildDefaultTenant());
  Logging.Info(`Default tenant '${DEFAULT_TENANT_ID}' created.`);
}
