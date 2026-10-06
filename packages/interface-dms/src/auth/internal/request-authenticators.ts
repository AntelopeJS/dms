import type { IncomingMessage } from "node:http";
import { HTTPResult, type RequestContext } from "@antelopejs/interface-api";
import type { User } from "./db";

const HTTP_UNAUTHORIZED = 401;

/** Identity and tenant established together by a verified credential, not authorization. */
export interface RequestPrincipal {
  user: User;
  tenantId: string;
}

/** A route-local credential handler. Recognition must include malformed owned credentials. */
export interface RequestAuthenticator {
  /** Claim this credential family without treating its contents as trusted. */
  recognizes(token: string): boolean;
  /** Verify the credential and reload its user; throw on invalid, expired or revoked credentials. */
  authenticate(token: string): Promise<RequestPrincipal>;
}

interface RequestIdentity {
  userId: string;
  tenantId: string;
}

interface RequestAuthenticationState {
  authorization: string | undefined;
  principal?: RequestIdentity;
}

const requestPrincipals = new WeakMap<
  IncomingMessage,
  RequestAuthenticationState
>();
const pendingAuthentications = new WeakMap<
  IncomingMessage,
  Promise<RequestPrincipal>
>();

function unauthorized(): HTTPResult {
  return new HTTPResult(HTTP_UNAUTHORIZED, "Unauthorized");
}

/** @internal Read only a successfully authenticated, unchanged request's tenant. */
export function getAuthenticatedRequestTenantId(
  ctx: RequestContext,
): string | undefined {
  const state = requestPrincipals.get(ctx.rawRequest);
  if (!state) return undefined;
  if (
    !state.principal ||
    state.authorization !== ctx.rawRequest.headers.authorization
  ) {
    throw unauthorized();
  }
  return state.principal.tenantId;
}

function readBearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw unauthorized();
  return match[1];
}

function assertPrincipal(
  principal: RequestPrincipal,
  previous?: RequestIdentity,
): void {
  if (
    typeof principal?.user?._id !== "string" ||
    !principal?.user?._id ||
    typeof principal.tenantId !== "string" ||
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

/** @internal Revalidate on every call; failures poison tenant resolution for this request. */
export async function resolveRequestPrincipal(
  ctx: RequestContext,
  authenticators: readonly RequestAuthenticator[],
  authenticateJwt: (token: string) => Promise<RequestPrincipal>,
): Promise<RequestPrincipal> {
  const pending =
    pendingAuthentications.get(ctx.rawRequest) ?? Promise.resolve();
  const result = pending.then(() =>
    verifyRequestPrincipal(ctx, authenticators, authenticateJwt),
  );
  pendingAuthentications.set(ctx.rawRequest, result);
  try {
    return await result;
  } finally {
    if (pendingAuthentications.get(ctx.rawRequest) === result) {
      pendingAuthentications.delete(ctx.rawRequest);
    }
  }
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
