import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantModel } from "@antelopejs/interface-dms/db";

const READABLE_REFUSALS = new Map([
  [
    "$page.settings.members.error.last_owner",
    "the workspace's last owner cannot lose the owner role",
  ],
  [
    "$page.settings.members.error.last_owner_delete",
    "the workspace or the platform would be left without an owner",
  ],
]);

/** The tenant an action acts in: its `tenantId` input, else the default one. */
export function actionTenantId(tenantId: string | undefined): string {
  return tenantId?.trim() || DEFAULT_TENANT_ID;
}

/** Whether a tenant row exists, without opening a model on its instance. */
export async function tenantExists(tenantId: string): Promise<boolean> {
  return Boolean(await GetModel(TenantModel).get(tenantId));
}

/** Fails the step for a tenant that does not exist. */
export async function requireTenant(
  actionId: string,
  tenantId: string,
): Promise<void> {
  if (!(await tenantExists(tenantId)))
    throw new Error(`${actionId}: unknown tenant "${tenantId}"`);
}

function refusalMessage(result: HTTPResult): string {
  const body = result.getBody();
  return READABLE_REFUSALS.get(body) ?? `${body} (HTTP ${result.getStatus()})`;
}

/**
 * Runs an action body so that what it throws fails the step with a readable
 * message prefixed by the action id: an `HTTPResult` from a shared service
 * would otherwise show as an object.
 */
export async function asStep<T>(
  actionId: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof HTTPResult)
      throw new Error(`${actionId}: ${refusalMessage(error)}`);
    if (error instanceof Error && !error.message.startsWith(`${actionId}:`))
      throw new Error(`${actionId}: ${error.message}`, { cause: error });
    throw error;
  }
}
