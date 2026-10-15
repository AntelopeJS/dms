import { createHash } from "node:crypto";
import type { DmsPublicSession, DmsServerEvent, DmsSession } from "#dms/server";
import { isPersistent, persistAccountSession, removeAccount } from "./accounts";

const REFRESH_TTL_MS = 15_000;
const REFUSED = [400, 401, 403];

/** A backend answer that opens a session: a token pair and the user. */
export interface SessionTokens {
  access_token: string;
  refresh_token?: string;
  user?: DmsSession["user"];
}

interface RefreshFlight {
  promise: Promise<SessionTokens>;
  expiresAt?: number;
}

const refreshes = new Map<string, RefreshFlight>();

export function isRefusal(error: unknown): boolean {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === "number" && REFUSED.includes(status);
}

/**
 * The session a token pair opens.
 *
 * @param result Backend answer carrying the tokens and the user
 * @param persistent Whether the session outlives the browser
 */
export function sessionFrom(
  result: SessionTokens,
  persistent = true,
): DmsSession {
  const payload = JSON.parse(
    Buffer.from(
      result.access_token.split(".")[1] ?? "",
      "base64url",
    ).toString() || "{}",
  ) as { tenantId?: string };
  return {
    user: result.user,
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    activeTenantId: payload.tenantId ?? "default",
    persistent,
  };
}

/** What a signed-in session shows the browser; the server adds `updatedAt`. */
export function publicSession(session: DmsSession): DmsPublicSession {
  return {
    user: session.user,
    session: {
      accountId: session.accountId,
      activeTenantId: session.activeTenantId,
    },
  };
}

/**
 * One backend refresh per refresh token at a time: the requests a page fires
 * together after its access token expired share it, rather than spending the
 * rotating refresh token several times over. Kept a while after it settles
 * for the requests that were already on their way.
 */
function singleFlight(
  token: string,
  operation: () => Promise<SessionTokens>,
): Promise<SessionTokens> {
  const now = Date.now();
  for (const [key, entry] of refreshes)
    if (entry.expiresAt && entry.expiresAt <= now) refreshes.delete(key);
  const key = createHash("sha256").update(token).digest("base64url");
  const current = refreshes.get(key);
  if (current) return current.promise;
  const entry: RefreshFlight = { promise: Promise.resolve().then(operation) };
  refreshes.set(key, entry);
  const retain = () => {
    entry.expiresAt = Date.now() + REFRESH_TTL_MS;
    setTimeout(() => {
      if (refreshes.get(key) === entry) refreshes.delete(key);
    }, REFRESH_TTL_MS).unref();
  };
  entry.promise.then(retain, retain);
  return entry.promise;
}

/**
 * Renews `session` with its refresh token, writes it and returns it; the rest
 * of the request runs with it. A refused refresh signs the browser out.
 * The frontend server calls it when the backend refuses a signed-in page
 * visit, and `POST /api/_auth/session` when the browser asks.
 */
export async function renewSession(
  event: DmsServerEvent,
  session: DmsSession | undefined = event.session.read(),
): Promise<DmsSession | undefined> {
  const refreshToken = session?.refreshToken;
  if (!session || !refreshToken) return undefined;
  try {
    const tokens = await singleFlight(refreshToken, () =>
      event.backend<SessionTokens>("/api/auth/refresh", {
        method: "POST",
        token: session.accessToken,
        body: { token: refreshToken },
      }),
    );
    const user = await event.backend<DmsSession["user"]>("/api/auth/me", {
      token: tokens.access_token,
    });
    const refreshed = sessionFrom({ ...tokens, user }, isPersistent(session));
    persistAccountSession(event, refreshed, session.accountId);
    event.session.useForRequest(refreshed);
    return refreshed;
  } catch (error) {
    if (isRefusal(error)) event.session.clear();
    event.session.useForRequest(undefined);
    return undefined;
  }
}

/** `GET /api/_auth/session`: the session as the browser sees it. */
export function readSessionRoute(event: DmsServerEvent) {
  return event.session.view();
}

/** `POST /api/_auth/session`: renews the session, then shows it. */
export async function refreshSessionRoute(event: DmsServerEvent) {
  await renewSession(event);
  return event.session.view();
}

/** `DELETE /api/_auth/session`: signs out, on the backend too. */
export async function logoutRoute(event: DmsServerEvent) {
  const session = event.session.read();
  if (session?.refreshToken && session.accessToken)
    await event
      .backend("/api/auth/logout", {
        method: "POST",
        token: session.accessToken,
        body: { token: session.refreshToken },
      })
      .catch(() => {});
  event.session.clear();
  if (session?.accountId) removeAccount(event, session.accountId);
  return {};
}

/** Any other method on `/api/_auth/session`. */
export function sessionMethodNotAllowed() {
  return Response.json(
    { error: "Method Not Allowed" },
    { status: 405, headers: { allow: "GET, POST, DELETE" } },
  );
}
