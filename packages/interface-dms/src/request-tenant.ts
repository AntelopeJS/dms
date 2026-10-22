import type { IncomingMessage } from "node:http";
import type { RequestContext } from "@antelopejs/interface-api";
import { internal } from "./auth";
import {
  bindVerifiedRequestPrincipal,
  getAuthenticatedRequestTenantId,
} from "./auth/internal/request-authenticators";
import { DEFAULT_TENANT_ID } from "./constants";

const BEARER_SCHEME = /^Bearer\s+(\S+)$/i;

const pendingResolutions = new WeakMap<IncomingMessage, Promise<string>>();

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

async function verifyRequestTenantId(
  ctx: RequestContext,
  token: string,
): Promise<string> {
  try {
    const data = await internal.IfAuthUserAuthenticator(token);
    if (!data) return DEFAULT_TENANT_ID;
    const user = await internal.AuthRawUserValidator(data);
    if (!user || typeof user === "boolean") return DEFAULT_TENANT_ID;
    const tenantId = data.tenantId || DEFAULT_TENANT_ID;
    bindVerifiedRequestPrincipal(ctx, { userId: user._id, tenantId });
    return tenantId;
  } catch {
    return DEFAULT_TENANT_ID;
  }
}

/**
 * {@link getRequestTenantId} for a provider that may run before the route's
 * auth decorator (`TenantScopedModel`, a tenant-scoped `Model`): a bearer
 * token not yet verified is verified here, and its tenant bound to the
 * request. An invalid token reads as anonymous: `DEFAULT_TENANT_ID`.
 */
export async function resolveRequestTenantId(
  ctx: RequestContext,
): Promise<string> {
  const bound = getAuthenticatedRequestTenantId(ctx);
  if (bound) return bound;
  const header = ctx.rawRequest?.headers?.authorization;
  const token =
    typeof header === "string" ? header.match(BEARER_SCHEME)?.[1] : undefined;
  if (!token) return DEFAULT_TENANT_ID;
  const request = ctx.rawRequest;
  const pending = pendingResolutions.get(request);
  if (pending) return pending;
  const resolution = verifyRequestTenantId(ctx, token);
  pendingResolutions.set(request, resolution);
  try {
    return await resolution;
  } finally {
    pendingResolutions.delete(request);
  }
}
