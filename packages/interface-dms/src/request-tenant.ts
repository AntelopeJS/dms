import type { RequestContext } from "@antelopejs/interface-api";
import { decode } from "jsonwebtoken";
import { getAuthenticatedRequestTenantId } from "./auth/request-authenticators";
import { DEFAULT_TENANT_ID } from "./constants";

const BEARER_PREFIX = "Bearer ";

interface DecodedTenantPayload {
  tenantId?: string;
}

function extractBearerToken(authHeader: unknown): string | undefined {
  if (typeof authHeader !== "string") return undefined;
  if (!authHeader.startsWith(BEARER_PREFIX)) return undefined;
  return authHeader.slice(BEARER_PREFIX.length);
}

function readTenantIdFromToken(token: string): string | undefined {
  try {
    const payload = decode(token) as DecodedTenantPayload | null;
    if (
      payload &&
      typeof payload.tenantId === "string" &&
      payload.tenantId.length > 0
    ) {
      return payload.tenantId;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Prefer the tenant bound by authenticateRequestPrincipal or the tenant guards.
 * An authentication failure or changed credential makes this accessor throw.
 * Without a bound principal, preserve legacy JWT decoding / DEFAULT_TENANT_ID.
 *
 * The legacy value is only *decoded*: this function does NOT verify the
 * JWT signature. It is safe when the request has already been authenticated
 * upstream (auth decorators such as `@AuthUser`, `@AuthTenantMember`, or the
 * gating performed by `PageController`) — those validators verify the signature
 * before this function runs, so the decoded `tenantId` is authentic.
 *
 * For routes that legitimately accept anonymous traffic (e.g. `@IfAuthUser`),
 * the fallback resolves to `DEFAULT_TENANT_ID` so public layouts can be served.
 *
 * Do NOT introduce new routes that rely on `tenantId` for authorization without
 * upstream auth verification — without signature checks, the claim is forgeable.
 */
export function getRequestTenantId(ctx: RequestContext): string {
  const authenticatedTenantId = getAuthenticatedRequestTenantId(ctx);
  if (authenticatedTenantId) return authenticatedTenantId;
  const token = extractBearerToken(ctx.rawRequest?.headers?.authorization);
  if (token) {
    const tenantIdFromJwt = readTenantIdFromToken(token);
    if (tenantIdFromJwt) return tenantIdFromJwt;
  }
  return DEFAULT_TENANT_ID;
}
