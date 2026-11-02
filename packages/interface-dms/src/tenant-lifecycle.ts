import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantLifecycleModel } from "./db/internal/tenantLifecycle.model";

const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_SERVER_ERROR_MIN = 500;
const RELEASE_ATTEMPTS = 3;

/** What a thrown `HTTPResult` exposes, whichever copy of the API built it. */
interface StatusCarrier {
  getStatus(): number;
}

/**
 * Whether the work refused on purpose, with an HTTP 4xx: a decision rather
 * than an effect whose outcome is unknown. Read by shape, not `instanceof`,
 * because the refusal can come from another module's copy of the API
 * interface (a dms-saas seat limit raised from a hook, for instance).
 */
function isDeliberateRefusal(error: Error["cause"]): boolean {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Legacy refusal detection reads getStatus from any thrown value without validating its shape; adding validation would change proxy and getter behavior.
  const getStatus = (error as Partial<StatusCarrier> | null)?.getStatus;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Refusals can originate in another copy of the API; the existing callable shape check intentionally avoids instanceof.
  if (typeof getStatus !== "function") return false;
  const status = getStatus.call(error);
  return status >= HTTP_CLIENT_ERROR_MIN && status < HTTP_SERVER_ERROR_MIN;
}

/**
 * Releases the admission of an invocation whose effects are all known: it
 * finished, or it refused on purpose. Releasing is idempotent, so a failed
 * release is tried again; the failure of the last try is returned, never
 * swallowed.
 */
async function releaseAttempt(
  model: TenantLifecycleModel,
  tenantId: string,
  attemptId: string,
): Promise<Error | undefined> {
  let failure: Error | undefined;
  for (let attempt = 0; attempt < RELEASE_ATTEMPTS; attempt++) {
    try {
      await model.finish(tenantId, attemptId);
      return undefined;
    } catch (releaseFailure) {
      failure = new Error("Tenant lifecycle release failed", {
        cause: releaseFailure,
      });
    }
  }
  return failure;
}

/**
 * Admits one invocation. Work must await every producer effect and start no
 * detached writer. Failure retains its admission; an independent replay must
 * never retire this invocation's identity. Each call takes its own admission,
 * so work never calls this again for the same tenant.
 *
 * A success, and a deliberate refusal (an HTTP 4xx), are the exceptions: work
 * that awaits every effect has none left in flight once it finishes or
 * refuses, so keeping the admission would only block the tenant's deletion
 * forever. The release is tried {@link RELEASE_ATTEMPTS} times. If every try
 * fails, the admission stays and the call rejects, so the blocked deletion is
 * reported instead of hidden: with an `AggregateError` of the refusal and the
 * release failure after a refusal, with the release failure after a success.
 */
export async function runTenantLifecycleOperation<T>(
  tenantId: string,
  work: () => Promise<T>,
): Promise<T> {
  const model = GetModel(TenantLifecycleModel, tenantId);
  const attemptId = randomUUID();
  await model.admit(tenantId, attemptId);
  let result: T;
  try {
    result = await work();
  } catch (error) {
    if (isDeliberateRefusal(error)) {
      const releaseFailure = await releaseAttempt(model, tenantId, attemptId);
      if (releaseFailure) {
        throw new AggregateError(
          [error, releaseFailure],
          "Tenant lifecycle admission refused the work but could not release; deletion of this tenant stays blocked",
        );
      }
    }
    throw error;
  }
  const releaseFailure = await releaseAttempt(model, tenantId, attemptId);
  if (releaseFailure) throw releaseFailure;
  return result;
}

/**
 * Must succeed before any destructive tenant phase. Closure is permanent;
 * rejection requires preserving data, never timeout-based takeover or reopening.
 */
export async function closeTenantLifecycleAdmission(
  tenantId: string,
): Promise<void> {
  await GetModel(TenantLifecycleModel, tenantId).close(tenantId);
}

/** A non-destructive snapshot; no attempt expires or is retired by observation. */
export interface TenantLifecycleObservation {
  revision: string;
  barrierId: string | null;
  activeAttemptIds: string[];
  closed: boolean;
}

/** Observe outside a producer callback: an initiator must not drain itself. */
export async function observeTenantLifecycle(
  tenantId: string,
): Promise<TenantLifecycleObservation> {
  const state = await GetModel(TenantLifecycleModel, tenantId).state(tenantId);
  return {
    revision: state.revision,
    barrierId: state.barrierId ?? null,
    activeAttemptIds: [...state.activeAttemptIds],
    closed: state.closed,
  };
}

/**
 * Publish a temporary barrier on the same CAS revision as producer admission.
 * Use a unique identity per phase, never reuse it. Observe the revision BEFORE
 * checking the durable business intent, then attempt this single CAS. After
 * acquisition recheck that intent; release if abandoned. False requires a new
 * observation and intent check, not a blind retry. Unknown outcomes throw.
 * Existing attempts keep running; only an empty observation while this barrier
 * remains owned permits inventory validation. No Stripe calls under a barrier.
 */
export async function pauseTenantLifecycleAdmission(
  tenantId: string,
  barrierId: string,
  expectedRevision: string,
): Promise<boolean> {
  return GetModel(TenantLifecycleModel, tenantId).pause(
    tenantId,
    barrierId,
    expectedRevision,
  );
}

/**
 * Release this owner's barrier, or invalidate the revision when none is held.
 * The latter revokes a delayed acquisition after its business intent is aborted.
 * Never reopens permanent deletion closure or another owner's barrier (false).
 * Retains every active/uncertain attempt; timeout is not evidence of completion.
 * Publish pending policy before release so newly admitted producers read it.
 */
export async function resumeTenantLifecycleAdmission(
  tenantId: string,
  barrierId: string,
): Promise<boolean> {
  return GetModel(TenantLifecycleModel, tenantId).resume(tenantId, barrierId);
}
