import { setTimeout } from "node:timers/promises";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantModel } from "@antelopejs/interface-dms/db";
import {
  Hook,
  type HookHandler,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { expect } from "chai";
import {
  ensureDefaultTenantExists,
  provisionDefaultTenant,
} from "../../../utils";
import { resetDatabase } from "../../helpers/db";

const LEASE = { renewEveryMs: 25, staleAfterMs: 400, pollEveryMs: 25 };
const OUTLASTS_STALE_WINDOW_MS = 1200;

function neverAborted(): AbortSignal {
  return new AbortController().signal;
}

async function pending(): Promise<boolean | undefined> {
  const tenant = await GetModel(TenantModel).get(DEFAULT_TENANT_ID);
  return tenant?.provisioningPending;
}

async function revision(): Promise<string | undefined> {
  const tenant = await GetModel(TenantModel).get(DEFAULT_TENANT_ID);
  return tenant?.provisioningRevision;
}

async function seedLeftBehindLease(): Promise<void> {
  await GetModel(TenantModel)
    .table.insert({
      _id: DEFAULT_TENANT_ID,
      provisioningPending: true,
      provisioningHolder: "stopped-host:1",
      provisioningRevision: "left-behind",
    })
    .run();
}

describe("[unit] default tenant provisioning across replicas", () => {
  let calls: number;
  let body: () => Promise<void>;
  const handler: HookHandler<Hook.TENANT_BEING_PROVISIONED> = async ({
    tenantId,
  }) => {
    if (tenantId === DEFAULT_TENANT_ID) {
      calls += 1;
      await body();
    }
    return undefined;
  };

  beforeEach(async () => {
    await resetDatabase();
    calls = 0;
    body = () => Promise.resolve();
    RegisterHook(Hook.TENANT_BEING_PROVISIONED, handler);
  });

  afterEach(async () => {
    UnregisterHook(Hook.TENANT_BEING_PROVISIONED, handler);
    await resetDatabase();
  });

  it("creates one row when two replicas insert it at once", async () => {
    const created = await Promise.all([
      ensureDefaultTenantExists(),
      ensureDefaultTenantExists(),
    ]);
    expect(created.filter(Boolean)).to.have.length(1);
  });

  it("lets one replica provision while the other waits for it", async () => {
    await ensureDefaultTenantExists();
    body = () => setTimeout(100).then(() => undefined);

    await Promise.all([
      provisionDefaultTenant(neverAborted(), LEASE),
      provisionDefaultTenant(neverAborted(), LEASE),
    ]);

    expect(calls).to.equal(1);
    expect(await pending()).to.equal(false);
  });

  it("does not take over a holder that outlasts the stale window while renewing", async () => {
    await ensureDefaultTenantExists();
    body = () => setTimeout(OUTLASTS_STALE_WINDOW_MS).then(() => undefined);

    await Promise.all([
      provisionDefaultTenant(neverAborted(), LEASE),
      provisionDefaultTenant(neverAborted(), LEASE),
    ]);

    expect(calls).to.equal(1);
  });

  it("takes over a holder only once its token stayed unchanged for the stale window", async () => {
    await seedLeftBehindLease();
    const started = performance.now();
    let waited = 0;
    body = () => {
      waited = performance.now() - started;
      return Promise.resolve();
    };

    await provisionDefaultTenant(neverAborted(), LEASE);

    expect(calls).to.equal(1);
    expect(waited).to.be.at.least(LEASE.staleAfterMs);
    expect(await pending()).to.equal(false);
  });

  it("does not wait for a stopped holder past its abort signal", async () => {
    await seedLeftBehindLease();
    const stopping = new AbortController();
    const waiting = provisionDefaultTenant(stopping.signal, {
      ...LEASE,
      staleAfterMs: 60_000,
    });
    await setTimeout(100);

    stopping.abort();
    await waiting;

    expect(calls).to.equal(0);
    expect(await pending()).to.equal(true);
  });

  it("stops renewing the lease of a run in progress once aborted", async () => {
    await ensureDefaultTenantExists();
    const stopping = new AbortController();
    let release: (() => void) | undefined;
    body = () =>
      new Promise((resolve) => {
        release = resolve;
      });
    const running = provisionDefaultTenant(stopping.signal, LEASE);
    while (!release) await setTimeout(LEASE.renewEveryMs);

    stopping.abort();
    await setTimeout(4 * LEASE.renewEveryMs);
    const atStop = await revision();
    await setTimeout(8 * LEASE.renewEveryMs);
    const later = await revision();
    release();
    await running;

    expect(later).to.equal(atStop);
  });

  it("frees the lease after a failure, so a waiting replica retries without the stale wait", async () => {
    await ensureDefaultTenantExists();
    body = () => Promise.reject(new Error("step failed"));
    await provisionDefaultTenant(neverAborted(), LEASE);
    expect(await pending()).to.equal(true);

    body = () => Promise.resolve();
    await provisionDefaultTenant(neverAborted(), {
      ...LEASE,
      staleAfterMs: 60_000,
    });

    expect(calls).to.equal(2);
    expect(await pending()).to.equal(false);
  });

  it("does not let a holder that lost the lease mark the tenant provisioned", async () => {
    await ensureDefaultTenantExists();
    const stopping = new AbortController();
    body = async () => {
      const tenants = GetModel(TenantModel);
      const tenant = await tenants.get(DEFAULT_TENANT_ID);
      await tenants.table
        .atomicMutation(DEFAULT_TENANT_ID, {
          type: "update",
          revisionField: "provisioningRevision",
          expectedRevision: tenant?.provisioningRevision ?? "",
          nextRevision: "taken-over",
          patch: { provisioningHolder: "other-host:2" },
        })
        .run();
      stopping.abort();
    };

    await provisionDefaultTenant(stopping.signal, {
      ...LEASE,
      staleAfterMs: 60_000,
    });

    const tenant = await GetModel(TenantModel).get(DEFAULT_TENANT_ID);
    expect(tenant?.provisioningPending).to.equal(true);
    expect(tenant?.provisioningHolder).to.equal("other-host:2");
  });
});
