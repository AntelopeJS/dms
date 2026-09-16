import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantLifecycleModel } from "./db/models/tenantLifecycle.model";

/**
 * Admits one invocation. Work must await every producer effect and start no
 * detached writer. Failure retains its admission; an independent replay must
 * never retire this invocation's identity. Internal nested calls reuse admission.
 */
export async function runTenantLifecycleOperation<T>(
  tenantId: string,
  work: () => Promise<T>,
): Promise<T> {
  const model = GetModel(TenantLifecycleModel, tenantId);
  const attemptId = randomUUID();
  await model.admit(tenantId, attemptId);
  const result = await work();
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
