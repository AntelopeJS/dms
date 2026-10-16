import type { DmsServerEvent } from "#dms/server";
import {
  isPersistent,
  persistAccountSession,
  readAccount,
  removeAccount,
  storeAccount,
  type StoredAccount,
} from "./accounts";
import { isRefusal, type SessionTokens, sessionFrom } from "./session";

// Carries the "keep me signed in" choice of a login across its 2FA step, whose
// request names only the challenge. Lives as long as the challenge token.
const PENDING_LOGIN = "dms_pending_login";
const PENDING_LOGIN_PATH = "/auth/verify-2fa";
const PENDING_LOGIN_LIFETIME_S = 300;

// Absolute backend API paths only: no scheme, no authority, no query string,
// and no segment that could climb out of `/api/`.
const BACKEND_API_PATH =
  /^\/api\/[A-Za-z0-9][A-Za-z0-9._~-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/;

type Input = Record<string, unknown>;

interface EstablishResult extends SessionTokens {
  requires_2fa?: boolean;
  requires_tenant_assignment?: boolean;
  two_factor_token?: string;
}

interface PendingLogin {
  token: string;
  persistent: boolean;
}

/**
 * Calls a backend endpoint that opens a session and, unless it asks for a
 * second step, writes the session and stores the account.
 */
async function establishWith(
  event: DmsServerEvent,
  endpoint: string,
  payload: unknown,
  persistent = true,
) {
  const result = await event.backend<EstablishResult>(endpoint, {
    method: "POST",
    body: payload,
  });
  if (result.requires_2fa && typeof result.two_factor_token === "string")
    event.cookies.writeSealed(
      PENDING_LOGIN,
      { token: result.two_factor_token, persistent },
      { maxAge: PENDING_LOGIN_LIFETIME_S, path: PENDING_LOGIN_PATH },
    );
  if (result.requires_2fa || result.requires_tenant_assignment) return result;
  if (event.cookies.readSealed(PENDING_LOGIN))
    event.cookies.clear(PENDING_LOGIN, { path: PENDING_LOGIN_PATH });
  const account = persistAccountSession(event, sessionFrom(result, persistent));
  return { user: result.user, account };
}

/**
 * `POST /auth/login`: signs in with a password. Only a login that asked to be
 * kept signed in outlives the browser; any other ends when the browser closes.
 */
export async function login(event: DmsServerEvent) {
  const input = await event.readJson<Input>();
  return establishWith(
    event,
    "/api/auth/login",
    input,
    input.keep_login === true,
  );
}

/** `POST /auth/register`: the signup page itself is `/auth/signup`. */
export async function signup(event: DmsServerEvent) {
  return establishWith(event, "/api/auth/signup", await event.readJson());
}

/**
 * `POST /auth/verify-2fa`: finishes a login on its 2FA step, with the lifetime
 * the login chose. A challenge that no login of this browser left a choice
 * for, such as the one an OAuth sign-in hands over, keeps the default.
 */
export async function verifyTwoFactor(event: DmsServerEvent) {
  const input = await event.readJson<Input>();
  const pending = event.cookies.readSealed<PendingLogin>(PENDING_LOGIN);
  const persistent =
    typeof input.token === "string" && pending?.token === input.token
      ? isPersistent(pending)
      : true;
  return establishWith(event, "/api/auth/verify-2fa", input, persistent);
}

/** `POST /auth/request-2fa-email`: relayed to the backend as is. */
export async function requestTwoFactorEmail(event: DmsServerEvent) {
  return event.backend("/api/auth/request-2fa-email", {
    method: "POST",
    body: await event.readJson(),
  });
}

/**
 * Whether a caller-named endpoint is one of the declared ones. The grammar is
 * checked on the caller's value too, so a declaration that was never meant to
 * be a prefix cannot be widened by a traversal or a query string smuggled
 * into the request.
 */
export function isAllowedEstablishEndpoint(
  endpoint: unknown,
  allowed: readonly string[],
): endpoint is string {
  return (
    typeof endpoint === "string" &&
    BACKEND_API_PATH.test(endpoint) &&
    allowed.includes(endpoint)
  );
}

/**
 * `POST /auth/establish`: opens a session from a backend endpoint that mints a
 * token pair, the generic half of `/auth/login`. A module whose own flow ends
 * in an authenticated user (a registration completing, an invitation being
 * redeemed) declares the backend route that finishes it
 * (`authEstablishEndpoints`, or `DMS_AUTH_ESTABLISH_ENDPOINTS`); the browser
 * names it and a payload, and never carries a token.
 */
export async function establish(event: DmsServerEvent) {
  const input = await event.readJson<Input>();
  if (
    !isAllowedEstablishEndpoint(
      input.endpoint,
      event.app.authEstablishEndpoints,
    )
  )
    return Response.json({ error: "Forbidden" }, { status: 403 });
  return establishWith(event, input.endpoint, input.payload ?? {});
}

/** `POST /auth/remove-account`: forgets a stored account. */
export async function removeStoredAccount(event: DmsServerEvent) {
  const input = await event.readJson<Input>();
  removeAccount(event, input.accountId);
  return { success: true };
}

/** `POST /auth/switch-tenant`: the same account, in another tenant. */
export async function switchTenant(event: DmsServerEvent) {
  const session = event.session.read();
  const input = await event.readJson<Input>();
  if (!session)
    return Response.json({ message: "Not authenticated" }, { status: 401 });
  if (!input.tenantId)
    return Response.json({ message: "tenantId required" }, { status: 400 });
  const tokens = await event.backend<SessionTokens>("/api/auth/switch-tenant", {
    method: "POST",
    token: session.accessToken,
    body: { refreshToken: session.refreshToken, tenantId: input.tenantId },
  });
  const user = await event.backend<SessionTokens["user"]>("/api/auth/me", {
    token: tokens.access_token,
  });
  const switched = sessionFrom({ ...tokens, user }, isPersistent(session));
  persistAccountSession(event, switched, session.accountId);
  return { success: true, user };
}

/** `POST /auth/switch-account`: signs in as another stored account. */
export async function switchAccount(event: DmsServerEvent) {
  const input = await event.readJson<Input>();
  const account = readAccount(event, input.accountId);
  if (!account)
    return Response.json({ message: "Account expired" }, { status: 401 });
  try {
    const tokens = await event.backend<SessionTokens>("/api/auth/refresh", {
      method: "POST",
      body: { token: account.refreshToken },
    });
    const user = await event.backend<SessionTokens["user"]>("/api/auth/me", {
      token: tokens.access_token,
    });
    const session = sessionFrom({ ...tokens, user }, isPersistent(account));
    const descriptor = persistAccountSession(
      event,
      session,
      input.accountId as string,
    );
    return { success: true, user, account: descriptor };
  } catch (error) {
    if (isRefusal(error)) removeAccount(event, input.accountId);
    throw error;
  }
}

/**
 * Keep the tokens a validation refreshed, without changing which account is
 * signed in. Another account only has its own cookie updated. The current one
 * also has the session updated, since a refresh may have rotated the token the
 * session holds; it keeps its user as the backend gave it.
 */
function storeValidatedAccount(
  event: DmsServerEvent,
  account: StoredAccount,
  accountId: string,
  tokens: SessionTokens,
) {
  const current = event.session.read();
  if (current?.accountId === accountId) {
    persistAccountSession(
      event,
      sessionFrom({ ...tokens, user: current.user }, isPersistent(current)),
      accountId,
    );
    return;
  }
  const user = {
    _id: account.userId,
    email: account.email,
    name: account.name,
  };
  storeAccount(
    event,
    sessionFrom({ ...tokens, user }, isPersistent(account)),
    accountId,
  );
}

/**
 * `POST /auth/validate-account`: whether a stored account can still sign in,
 * keeping the tokens the check refreshed. `null` when the backend could not
 * tell.
 */
export async function validateAccount(event: DmsServerEvent) {
  const input = await event.readJson<Input>();
  const account = readAccount(event, input.accountId);
  if (!account) return { valid: false };
  try {
    const tokens = await event.backend<SessionTokens>("/api/auth/refresh", {
      method: "POST",
      body: { token: account.refreshToken },
    });
    storeValidatedAccount(event, account, input.accountId as string, tokens);
    return { valid: true };
  } catch (error) {
    const rejected = isRefusal(error);
    if (rejected) removeAccount(event, input.accountId);
    return { valid: rejected ? false : null };
  }
}
