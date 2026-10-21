import { strict as assert } from "node:assert";
import { Logging } from "@antelopejs/interface-core/logging";
import { Schema } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TENANT_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { TenantModel } from "@antelopejs/interface-dms/db";
import {
  DEFAULT_TENANT_INSTANCE_WAIT_MS,
  type WaitForTenantInstanceOptions,
} from "@antelopejs/interface-dms/tenant-instances";
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
  releaseTenantInstanceWaiters(tenantId);
}

/** The callers of `WaitForTenantInstance` still waiting, by tenant. */
const tenantInstanceWaiters = new Map<string, Set<() => void>>();

function releaseTenantInstanceWaiters(tenantId: string): void {
  const waiters = tenantInstanceWaiters.get(tenantId);
  if (!waiters) return;
  tenantInstanceWaiters.delete(tenantId);
  for (const release of waiters) release();
}

// Before the DMS registers its schemas, there is no instance to list yet.
async function hasTenantInstance(tenantId: string): Promise<boolean> {
  const schema = Schema.get(TENANT_SCHEMA_NAME);
  if (!schema) return false;
  try {
    return (await schema.listInstances()).includes(tenantId);
  } catch {
    return false;
  }
}

/**
 * Releases the waiters whose tenant already has an instance: called once the
 * DMS has registered its schemas, for callers that started waiting before.
 */
export async function recheckTenantInstanceWaiters(): Promise<void> {
  for (const tenantId of tenantInstanceWaiters.keys()) {
    if (await hasTenantInstance(tenantId)) {
      releaseTenantInstanceWaiters(tenantId);
    }
  }
}

/**
 * Implements `WaitForTenantInstance`: the waiter is recorded before the
 * instance is looked up, so a registration landing between the two still
 * releases it.
 */
export async function waitForTenantInstance(
  tenantId: string,
  {
    timeoutMs = DEFAULT_TENANT_INSTANCE_WAIT_MS,
  }: WaitForTenantInstanceOptions = {},
): Promise<void> {
  let release!: () => void;
  const registered = new Promise<void>((resolve) => {
    release = resolve;
  });
  let waiters = tenantInstanceWaiters.get(tenantId);
  if (!waiters) {
    waiters = new Set();
    tenantInstanceWaiters.set(tenantId, waiters);
  }
  waiters.add(release);
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `Tenant '${tenantId}' has no instance of schema '${TENANT_SCHEMA_NAME}' after ${timeoutMs} ms: wait for it from start(), a hook handler or a request, never awaited in construct()`,
        ),
      );
    }, timeoutMs);
  });
  try {
    if (await hasTenantInstance(tenantId)) return;
    await Promise.race([registered, timedOut]);
  } finally {
    clearTimeout(timer);
    const pending = tenantInstanceWaiters.get(tenantId);
    pending?.delete(release);
    if (pending?.size === 0) tenantInstanceWaiters.delete(tenantId);
  }
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
