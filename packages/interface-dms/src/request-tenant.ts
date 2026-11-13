import type { RequestContext } from "@antelopejs/interface-api";
import { internal } from "./auth";
import {
  getAuthenticatedRequestTenantId,
  resolveRequestTenant,
} from "./auth/internal/request-authenticators";
import { DEFAULT_TENANT_ID } from "./constants";
import { isBoolean } from "./utils/internal/type-check";

/**
 * The tenant of the request's verified credential: the one bound by the DMS
 * auth decorators (`AuthUser`, `AuthUserWithPermission`, `IfAuthUser` with a
 * valid token…), the tenant guards or `authenticateRequestPrincipal`.
 * Without a verified credential, `DEFAULT_TENANT_ID`: a token is never read
 * for its tenant before its signature, user and session are checked.
 *
 * Call it once the route's auth decorator has run (in the handler). A
 * parameter or property provider resolved alongside the auth decorator uses
 * {@link resolveRequestTenantId} instead.
 *
 * @throws HTTPResult 401 when the request's authentication failed or its
 * credential changed since
 */
export function getRequestTenantId(ctx: RequestContext): string {
  return getAuthenticatedRequestTenantId(ctx) ?? DEFAULT_TENANT_ID;
}

async function verifyToken(
  token: string,
): Promise<{ userId: string; tenantId: string } | undefined> {
  try {
    const data = await internal.IfAuthUserAuthenticator(token);
    if (!data) return undefined;
    const user = await internal.AuthRawUserValidator(data);
    if (!user || isBoolean(user)) return undefined;
    return { userId: user._id, tenantId: data.tenantId || DEFAULT_TENANT_ID };
  } catch {
    return undefined;
  }
}

/**
 * {@link getRequestTenantId} for a provider resolved alongside the route's
 * auth decorators (`TenantScopedModel`, a tenant-scoped `Model`). It waits
 * for the tenant guards and credential checks the route's other providers
 * start, and answers the tenant they verified. Without one, a bearer token is
 * verified here and its tenant bound to the request. A request without a
 * verified credential reads as anonymous: `DEFAULT_TENANT_ID`, and an
 * identity verified on it afterwards is refused.
 *
 * @throws HTTPResult 401 when the request's authentication failed, its
 * credential changed since, or another provider verified a different identity
 */
export async function resolveRequestTenantId(
  ctx: RequestContext,
): Promise<string> {
  return (await resolveRequestTenant(ctx, verifyToken)) ?? DEFAULT_TENANT_ID;
}
