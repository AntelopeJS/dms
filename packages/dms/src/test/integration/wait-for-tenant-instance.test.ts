import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { WaitForTenantInstance } from "@antelopejs/interface-dms/tenant-instances";
import { registerTenantInstance } from "../../utils/tenant-instances";

const SETTLE_MS = 50;

function settled(promise: Promise<unknown>): Promise<boolean> {
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), SETTLE_MS),
    ),
  ]);
}

describe("WaitForTenantInstance", () => {
  it("resolves at once for a tenant whose instance exists", async () => {
    assert.equal(await settled(WaitForTenantInstance(DEFAULT_TENANT_ID)), true);
  });

  it("waits for a tenant until the DMS registers its instance", async () => {
    const tenantId = `wait-${randomUUID()}`;
    const waiting = WaitForTenantInstance(tenantId, { timeoutMs: 5_000 });

    assert.equal(await settled(waiting), false);
    await registerTenantInstance(tenantId);
    assert.equal(await settled(waiting), true);
  });

  it("rejects once its timeout passes without an instance", async () => {
    const tenantId = `never-${randomUUID()}`;
    await assert.rejects(
      WaitForTenantInstance(tenantId, { timeoutMs: 20 }),
      new RegExp(`Tenant '${tenantId}' has no instance`),
    );
  });
});
