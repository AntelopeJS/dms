import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { Logging } from "@antelopejs/interface-core/logging";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
} from "@antelopejs/interface-dms/constants";
import { type Tenant, TenantModel } from "@antelopejs/interface-dms/db";
import { ProvisionTenant } from "@antelopejs/interface-dms/tenant-provisioning";
import {
  getProvisioningLeaseConfig,
  type ProvisioningLeaseConfig,
} from "../config";

type LeasePatch = Pick<Tenant, "provisioningHolder" | "provisioningPending">;

/** The token a first claim expects: the row exists and has none yet. */
const NO_REVISION = { kind: "missing" } as const;

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
 * Existing rows are left unchanged, including a pending provisioning attempt. A
 * replica that loses the insert to another one finds the row and carries on.
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

  try {
    await tenants.insert(buildDefaultTenant());
  } catch (error) {
    if (!(await tenants.get(DEFAULT_TENANT_ID))) throw error;
    Logging.Info(`Default tenant '${DEFAULT_TENANT_ID}' already exists.`);
    return false;
  }
  Logging.Info(`Default tenant '${DEFAULT_TENANT_ID}' created.`);
  return true;
}

/**
 * Replaces the lease token when it is still `expected`, the one write that lets
 * a replica claim, renew or release the lease.
 *
 * @returns The new token, or undefined when the swap did not apply
 */
async function swapLease(
  expected: string | typeof NO_REVISION,
  patch: Partial<LeasePatch>,
): Promise<string | undefined> {
  const tenants = GetModel(TenantModel);
  const next = randomUUID();
  const outcome = await tenants.table
    .atomicMutation(DEFAULT_TENANT_ID, {
      type: "update",
      revisionField: "provisioningRevision",
      expectedRevision: expected,
      nextRevision: next,
      patch,
    })
    .run();
  if (outcome === "applied") return next;
  if (outcome === "not-applied") return undefined;
  const stored = await tenants.get(DEFAULT_TENANT_ID);
  return stored?.provisioningRevision === next ? next : undefined;
}

/** A claimed lease, renewed in the background for as long as the work runs. */
interface HeldLease {
  /** Stops renewing. Answers the current token, or undefined if the lease was lost. */
  stopRenewing(): Promise<string | undefined>;
}

function holdLease(
  claimed: string,
  renewEveryMs: number,
  signal: AbortSignal,
): HeldLease {
  let token: string | undefined = claimed;
  let renewal: Promise<void> = Promise.resolve();

  const renew = async () => {
    if (!token) return;
    try {
      const next = await swapLease(token, {});
      if (next) {
        token = next;
        return;
      }
      const stored = await GetModel(TenantModel).get(DEFAULT_TENANT_ID);
      if (stored?.provisioningRevision !== token) token = undefined;
    } catch (error) {
      Logging.Warn(
        `Default tenant '${DEFAULT_TENANT_ID}' lease renewal failed:`,
        error,
      );
    }
  };
  const timer = setInterval(() => {
    renewal = renewal.then(renew);
  }, renewEveryMs);
  const stopTimer = () => clearInterval(timer);
  if (signal.aborted) stopTimer();
  else signal.addEventListener("abort", stopTimer, { once: true });

  return {
    async stopRenewing() {
      clearInterval(timer);
      await renewal;
      return token;
    },
  };
}

/**
 * Runs the provisioning under a claimed lease. Clearing the marker and giving
 * the lease back are one write, which fails for a holder that lost the lease:
 * it cannot declare the tenant provisioned for whoever took over.
 *
 * @returns Whether this replica is done: provisioned, or failed its one attempt
 */
async function provisionUnderLease(
  claimed: string,
  renewEveryMs: number,
  signal: AbortSignal,
): Promise<boolean> {
  const lease = holdLease(claimed, renewEveryMs, signal);
  let failure: { error: unknown } | undefined;
  try {
    await ProvisionTenant({ tenantId: DEFAULT_TENANT_ID, extras: {} });
  } catch (error) {
    failure = { error };
  }
  const token = await lease.stopRenewing();
  if (failure) {
    Logging.Error(
      `Default tenant '${DEFAULT_TENANT_ID}' provisioning failed:`,
      failure.error,
    );
  }
  const finished =
    token &&
    (await swapLease(token, {
      provisioningHolder: null,
      provisioningPending: failure !== undefined,
    }));
  if (!finished) {
    Logging.Warn(
      `Default tenant '${DEFAULT_TENANT_ID}' provisioning lease was lost; another replica took over.`,
    );
  }
  return finished !== undefined || failure !== undefined;
}

/**
 * Tells whether a holder stopped, from its token alone: the same token seen
 * again after `staleAfterMs` on this replica's own clock. A failed read is no
 * evidence, so the caller forgets what it saw.
 */
function createStaleWatch(staleAfterMs: number) {
  let seen: { revision: string | undefined; at: number } | undefined;
  return {
    forget() {
      seen = undefined;
    },
    isStale(revision: string | undefined): boolean {
      const now = performance.now();
      if (seen?.revision !== revision) seen = undefined;
      seen ??= { revision, at: now };
      return now - seen.at >= staleAfterMs;
    },
  };
}

/** @returns Whether this replica has nothing left to do */
async function advanceLease(
  watch: ReturnType<typeof createStaleWatch>,
  renewEveryMs: number,
  signal: AbortSignal,
): Promise<boolean> {
  const tenant = await GetModel(TenantModel).get(DEFAULT_TENANT_ID);
  if (!tenant?.provisioningPending) return true;
  const stale = watch.isStale(tenant.provisioningRevision);
  if (tenant.provisioningHolder && !stale) return false;
  const claimed = await swapLease(tenant.provisioningRevision ?? NO_REVISION, {
    provisioningHolder: holderName(),
  });
  return (
    claimed !== undefined && provisionUnderLease(claimed, renewEveryMs, signal)
  );
}

function holderName(): string {
  return `${hostname()}:${process.pid}`;
}

/**
 * Provisions the `default` tenant only when its row marks provisioning pending.
 * It has no owner yet, so the payload carries no `userId`.
 *
 * Replicas elect one holder through the row: the others wait in the background,
 * so a start never waits for provisioning and never fails for it, and take over
 * when the holder's token stops changing. Clears the marker only after every
 * provisioning handler resolves. A failure is logged, frees the lease for a
 * waiting replica, and leaves the row pending for the next attempt. Legacy rows
 * with no marker are already provisioned and are not run again.
 *
 * @param signal Ends a wait for another replica's provisioning and stops renewing the lease. A run in progress finishes.
 * @param lease How often to renew and poll, and when a holder counts as stopped
 */
export async function provisionDefaultTenant(
  signal: AbortSignal = new AbortController().signal,
  lease: ProvisioningLeaseConfig = getProvisioningLeaseConfig(),
): Promise<void> {
  const { renewEveryMs, staleAfterMs, pollEveryMs } = lease;
  const watch = createStaleWatch(staleAfterMs);
  while (!signal.aborted) {
    try {
      if (await advanceLease(watch, renewEveryMs, signal)) return;
    } catch (error) {
      watch.forget();
      Logging.Warn(
        `Default tenant '${DEFAULT_TENANT_ID}' provisioning lease check failed:`,
        error,
      );
    }
    await sleep(pollEveryMs, undefined, { signal }).catch(() => undefined);
  }
}
