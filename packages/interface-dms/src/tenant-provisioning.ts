import { strict as assert } from "node:assert";
import { Schema } from "@antelopejs/interface-database";
import { TENANT_SCHEMA_NAME } from "./constants";
import {
  ExecuteHooks,
  Hook,
  type TenantProvisioningHookPayload,
} from "./hooks";

/**
 * Provision a tenant whose row was just created: register it as an instance
 * of the tenant schema, then run the `Hook.TENANT_BEING_PROVISIONED`
 * handlers in series. The instance is registered first, here rather than by a
 * handler, so no handler ever runs before it, whatever order the modules
 * registered in.
 *
 * Fire the hook only through this function. A handler that throws rejects the
 * call. Signup callers unwind the tenant they were creating. Default tenant
 * provisioning retains its pending row and retries this function after startup.
 *
 * @param payload Tenant being provisioned and what the caller carries along
 */
export async function ProvisionTenant(
  payload: TenantProvisioningHookPayload,
): Promise<void> {
  const schema = Schema.get(TENANT_SCHEMA_NAME);
  assert(schema, `Schema '${TENANT_SCHEMA_NAME}' is not registered`);
  await schema.createInstance(payload.tenantId);
  await ExecuteHooks(Hook.TENANT_BEING_PROVISIONED, payload);
}
