import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantLifecycleModel } from "./db/models/tenantLifecycle.model";

const HTTP_CLIENT_ERROR_MIN = 400;
const HTTP_SERVER_ERROR_MIN = 500;

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
function isDeliberateRefusal(error: unknown): boolean {
  const getStatus = (error as Partial<StatusCarrier> | null)?.getStatus;
  if (typeof getStatus !== "function") return false;
  const status = getStatus.call(error);
  return status >= HTTP_CLIENT_ERROR_MIN && status < HTTP_SERVER_ERROR_MIN;
}

/**
 * Admits one invocation. Work must await every producer effect and start no
 * detached writer. Failure retains its admission; an independent replay must
 * never retire this invocation's identity. Internal nested calls reuse admission.
 *
 * A deliberate refusal (an HTTP 4xx) is the exception: work that awaits every
 * effect has none left in flight once it refuses, so keeping the admission
 * would only block the tenant's deletion forever.
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
      // The refusal is what the caller has to see; an admission that fails to
      // release stays retained, which only fails closed.
      await model.finish(tenantId, attemptId).catch(() => undefined);
    }
    throw error;
  }
  await model.finish(tenantId, attemptId);
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
