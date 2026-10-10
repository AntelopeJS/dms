import {
  Hook,
  RegisterHook,
  type TenantProvisioningHookPayload,
} from "@antelopejs/interface-dms/hooks";
import { registerTenantInstance } from "../utils/tenant-instances";

async function onTenantBeingProvisioned(
  payload: TenantProvisioningHookPayload,
): Promise<undefined> {
  await registerTenantInstance(payload.tenantId);
  return undefined;
}

/**
 * Registers each provisioned tenant as an instance of the tenant schema.
 *
 * Deleting a tenant keeps its instance on purpose: destroying it would wipe
 * every row of the schema for that tenant, including the closed lifecycle
 * marker the `TENANT_DELETED` cleanup writes to refuse late operations.
 */
export function registerTenantInstanceProvisioning(): void {
  RegisterHook(Hook.TENANT_BEING_PROVISIONED, onTenantBeingProvisioned);
}
