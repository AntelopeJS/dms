import { strict as assert } from "node:assert";
import { Logging } from "@antelopejs/interface-core/logging";
import { Schema } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { runInBatches } from "./run-in-batches";

const TENANT_ID_FIELD = "_id";
const INSTANCE_REGISTRATION_CONCURRENCY = 8;

interface TenantIdRow {
  _id: string;
}

function getTenantSchema(): Schema {
  const schema = Schema.get(TENANT_SCHEMA_NAME);
  assert(schema, `Schema '${TENANT_SCHEMA_NAME}' is not registered`);
  return schema;
}

/**
 * Records `tenantId` as an instance of the tenant schema, so the database
 * adapter lists it among the schema's instances. Idempotent: registering a
 * tenant twice leaves its instance and its data untouched.
 *
 * @param tenantId Tenant whose instance to register
 */
export async function registerTenantInstance(tenantId: string): Promise<void> {
  await getTenantSchema().createInstance(tenantId);
}

async function listTenantIds(): Promise<string[]> {
  const rows = (await GetModel(TenantModel).table.pluck(
    TENANT_ID_FIELD,
  )) as TenantIdRow[];
  return rows.map((row) => row._id);
}

/**
 * Registers the tenant-schema instance of every tenant that has none yet,
 * covering tenants created before instances were registered or by a path
 * that did not fire the provisioning hook.
 */
export async function registerExistingTenantInstances(): Promise<void> {
  const [tenantIds, instances] = await Promise.all([
    listTenantIds(),
    getTenantSchema().listInstances(),
  ]);
  const registered = new Set(instances);
  const missing = tenantIds.filter((tenantId) => !registered.has(tenantId));
  await runInBatches(
    missing,
    INSTANCE_REGISTRATION_CONCURRENCY,
    registerTenantInstance,
  );
  if (missing.length > 0) {
    Logging.Info(
      `Registered ${missing.length} tenant instance(s) in schema '${TENANT_SCHEMA_NAME}'.`,
    );
  }
}
