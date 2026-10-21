import { InterfaceFunction } from "@antelopejs/interface-core";

/** How long {@link WaitForTenantInstance} waits by default: 5 minutes. */
export const DEFAULT_TENANT_INSTANCE_WAIT_MS = 5 * 60_000;

/** Options of {@link WaitForTenantInstance}. */
export interface WaitForTenantInstanceOptions {
  /**
   * How long to wait before giving up, in milliseconds.
   * Defaults to {@link DEFAULT_TENANT_INSTANCE_WAIT_MS}.
   */
  timeoutMs?: number;
}

/**
 * Resolves once `tenantId` is an instance of the tenant schema, so that
 * `GetModel(Model, tenantId)` can read and write its tables: at once for a
 * tenant whose instance exists, else when the DMS registers it (when it
 * provisions the tenant, or at startup for a tenant created earlier).
 *
 * Call it from `start()`, a hook handler or a request, never awaited in
 * `construct()`: the DMS registers instances once its schemas are, in its own
 * `start()`.
 *
 * @param tenantId The tenant to wait for
 * @param options How long to wait
 * @throws Error when the instance is not registered within `timeoutMs`
 *
 * @example
 * await WaitForTenantInstance(declaration.tenantId);
 * await GetModel(MediaFolderModel, declaration.tenantId).insert(folder);
 */
export const WaitForTenantInstance =
  InterfaceFunction<
    (tenantId: string, options?: WaitForTenantInstanceOptions) => Promise<void>
  >();
