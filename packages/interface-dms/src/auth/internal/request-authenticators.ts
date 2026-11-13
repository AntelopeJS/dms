import type { IncomingMessage } from "node:http";
import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import type {
  RequestAuthenticator,
  RequestPrincipal,
} from "../request-authenticators";
import { isString } from "../../utils/internal/type-check";

const HTTP_UNAUTHORIZED = 401;
const BEARER_SCHEME = /^Bearer\s+(\S+)$/i;

interface RequestIdentity {
  userId: string;
  tenantId: string;
}

interface RequestAuthenticationState {
  authorization: string | undefined;
  principal?: RequestIdentity;
  /** Read as anonymous for its tenant: no identity binds to it afterwards. */
  anonymous?: true;
}

const requestPrincipals = new WeakMap<
  IncomingMessage,
  RequestAuthenticationState
>();
const pendingAuthentications = new WeakMap<IncomingMessage, Promise<unknown>>();

function unauthorized(): HTTPResult {
  return new HTTPResult(HTTP_UNAUTHORIZED, "Unauthorized");
}

/** @internal Read only a successfully authenticated, unchanged request's tenant. */
export function getAuthenticatedRequestTenantId(
  ctx: RequestContext,
): string | undefined {
  const state = requestPrincipals.get(ctx.rawRequest);
  if (!state) return undefined;
  if (state.authorization !== ctx.rawRequest.headers.authorization) {
    throw unauthorized();
  }
  if (state.anonymous) return undefined;
  if (!state.principal) throw unauthorized();
  return state.principal.tenantId;
}

function readBearerToken(authorization: string | undefined): string {
  const match = authorization?.match(BEARER_SCHEME);
  if (!match) throw unauthorized();
  return match[1];
}

function assertPrincipal(
  principal: RequestPrincipal,
  previous?: RequestIdentity,
): void {
  if (
    !isString(principal?.user?._id) ||
    !principal?.user?._id ||
    !isString(principal.tenantId) ||
    !principal.tenantId
  ) {
    throw unauthorized();
  }
  if (
    previous &&
    (previous.userId !== principal.user._id ||
      previous.tenantId !== principal.tenantId)
  ) {
    throw unauthorized();
  }
}

/**
 * Runs `step` once the request's authentications already in flight have
 * settled, and holds back the ones started after it until it settles.
 */
async function serialized<T>(
  request: IncomingMessage,
  step: () => Promise<T>,
): Promise<T> {
  const pending = pendingAuthentications.get(request) ?? Promise.resolve();
  const result = pending.then(step);
  pendingAuthentications.set(request, result);
  try {
    return await result;
  } finally {
    if (pendingAuthentications.get(request) === result) {
      pendingAuthentications.delete(request);
    }
  }
}

/** @internal Revalidate on every call; failures poison tenant resolution for this request. */
export async function resolveRequestPrincipal(
  ctx: RequestContext,
  authenticators: readonly RequestAuthenticator[],
  authenticateJwt: (token: string) => Promise<RequestPrincipal>,
): Promise<RequestPrincipal> {
  return serialized(ctx.rawRequest, () =>
    verifyRequestPrincipal(ctx, authenticators, authenticateJwt),
  );
}

/**
 * @internal The tenant of the request's credential, for a provider resolved
 * alongside the route's guards. It waits for the authentications the
 * request's other providers start in the same pass, then answers the tenant
 * they bound. Without one it verifies the bearer token with `verifyToken` and
 * binds its identity; a token it cannot verify reads as anonymous, and any
 * identity bound to the request afterwards is refused.
 *
 * @throws HTTPResult 401 when the request's authentication failed, its
 * credential changed, or a verified identity conflicts with the bound one
 */
export async function resolveRequestTenant(
  ctx: RequestContext,
  verifyToken: (token: string) => Promise<RequestIdentity | undefined>,
): Promise<string | undefined> {
  await Promise.resolve();
  return serialized(ctx.rawRequest, async () => {
    const request = ctx.rawRequest;
    if (requestPrincipals.has(request)) {
      return getAuthenticatedRequestTenantId(ctx);
    }
    const authorization = request.headers.authorization;
    const token = authorization?.match(BEARER_SCHEME)?.[1];
    const identity = token ? await verifyToken(token) : undefined;
    if (identity) {
      bindVerifiedRequestPrincipal(ctx, identity);
      return identity.tenantId;
    }
    if (requestPrincipals.has(request)) throw unauthorized();
    requestPrincipals.set(request, { authorization, anonymous: true });
    return undefined;
  });
}

async function verifyRequestPrincipal(
  ctx: RequestContext,
  authenticators: readonly RequestAuthenticator[],
  authenticateJwt: (token: string) => Promise<RequestPrincipal>,
): Promise<RequestPrincipal> {
  const request = ctx.rawRequest;
  const authorization = request.headers.authorization;
  const previous = requestPrincipals.get(request);
  const state: RequestAuthenticationState = { authorization };
  requestPrincipals.set(request, state);
  if (
    previous &&
    (!previous.principal || previous.authorization !== authorization)
  ) {
    throw unauthorized();
  }
  const token = readBearerToken(authorization);
  const handlers = authenticators.filter((handler) =>
    handler.recognizes(token),
  );
  if (handlers.length > 1) throw unauthorized();
  const principal = handlers.length
    ? await handlers[0].authenticate(token)
    : await authenticateJwt(token);
  assertPrincipal(principal, previous?.principal);
  if (
    requestPrincipals.get(request) !== state ||
    request.headers.authorization !== authorization
  ) {
    throw unauthorized();
  }
  const snapshot = { tenantId: principal.tenantId, userId: principal.user._id };
  requestPrincipals.set(request, { authorization, principal: snapshot });
  return principal;
}

/**
 * @internal Records the identity a JWT auth decorator has just verified, so
 * `getRequestTenantId` reads the tenant of a checked credential. A request
 * already bound to another identity, or to a failed authentication, or whose
 * credential changed since, is refused.
 */
export function bindVerifiedRequestPrincipal(
  ctx: RequestContext,
  identity: RequestIdentity,
): void {
  const request = ctx.rawRequest;
  const authorization = request.headers.authorization;
  const previous = requestPrincipals.get(request);
  if (previous) {
    if (
      !previous.principal ||
      previous.authorization !== authorization ||
      previous.principal.userId !== identity.userId ||
      previous.principal.tenantId !== identity.tenantId
    ) {
      throw unauthorized();
    }
    return;
  }
  requestPrincipals.set(request, { authorization, principal: { ...identity } });
}
