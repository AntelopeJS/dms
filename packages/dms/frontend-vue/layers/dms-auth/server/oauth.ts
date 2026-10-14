import { timingSafeEqual } from "node:crypto";
import type { DmsServerEvent } from "#dms/server";
import { privateSecret } from "../../../server/private-options";
import { persistAccountSession } from "./accounts";
import { type SessionTokens, sessionFrom } from "./session";

// The provider sign-in, on the frontend's origin: the backend builds the
// provider's URL and its callback (`relay.ts`, `config.ts`) and checks the
// relay header this server sends, from the DMS module's private options.

const FLOW = "dms_oauth_flow";
const HANDOFF = "dms_oauth_handoff";
const FLOW_PATH = "/auth/oauth";
const COMPLETE = "/auth/oauth/complete";
const SIGN_IN = "/auth";
const OAUTH_ERROR = "error.oauth.";
const FAILED = "error.oauth.failed";
const FLOW_LIFETIME_MS = 10 * 60 * 1000;
const HANDOFF_LIFETIME_S = 300;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 10;
const MAX_RATE_LIMIT_CLIENTS = 10_000;
const MAX_CALLBACK_PARAMETER_LENGTH = 2048;
const PROVIDER = /^[a-z0-9-]{1,32}$/;

interface RateWindow {
  count: number;
  startedAt: number;
}

interface OAuthFlow {
  state: string;
  expiresAt: number;
  redirect: string;
  language: string;
  invite: string;
}

interface OAuthResult extends SessionTokens {
  requires_2fa?: boolean;
  requires_tenant_assignment?: boolean;
  two_factor_token?: string;
  tenant_assignment_token?: string;
  methods?: unknown;
}

// Process-local, like the session refresh: one frontend process per sticky
// client. A development reload of this file starts it over.
const attempts = new Map<string, RateWindow>();

function sweepAttempts(now: number) {
  for (const [key, window] of attempts)
    if (now - window.startedAt >= RATE_WINDOW_MS) attempts.delete(key);
  while (attempts.size >= MAX_RATE_LIMIT_CLIENTS)
    attempts.delete(attempts.keys().next().value as string);
}

/** Counts an attempt for `key`; false once over the limit of the window. */
export function hitOAuthRateLimitKey(key: string, now = Date.now()): boolean {
  sweepAttempts(now);
  const window = attempts.get(key);
  if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
    attempts.set(key, { count: 1, startedAt: now });
    return true;
  }
  window.count += 1;
  return window.count <= RATE_LIMIT;
}

function rateLimited(event: DmsServerEvent, scope: string): boolean {
  return !hitOAuthRateLimitKey(`${scope}:${event.clientIp()}`);
}

export function isValidOAuthProvider(provider: unknown): provider is string {
  return typeof provider === "string" && PROVIDER.test(provider);
}

function safePath(value: string | null): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  )
    return "";
  try {
    const decoded = decodeURIComponent(value);
    return decoded.startsWith("//") || decoded.includes("\\") ? "" : value;
  } catch {
    return "";
  }
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function errorRedirect(key: string): Response {
  return redirect(`${SIGN_IN}?oauth_error=${encodeURIComponent(key)}`);
}

// The backend's own OAuth key says why a provider sign-in failed; any other
// failure keeps the generic one.
function failureRedirect(error: unknown): Response {
  const message = error instanceof Error ? error.message : "";
  const status = (error as { status?: unknown }).status;
  return errorRedirect(
    typeof status === "number" && message.startsWith(OAUTH_ERROR)
      ? message
      : FAILED,
  );
}

function relayHeaders(event: DmsServerEvent): Record<string, string> {
  const secret = privateSecret(
    event,
    "oauth",
    "relaySecret",
    "DMS_OAUTH_RELAY_SECRET",
  );
  return { "x-dms-oauth-relay": secret ?? "" };
}

/** `GET /auth/oauth/:provider/start`: on to the provider's sign-in page. */
export async function oauthStart(event: DmsServerEvent): Promise<Response> {
  const { provider } = event.params;
  if (
    !isValidOAuthProvider(provider) ||
    event.request.headers.get("sec-fetch-site") === "cross-site" ||
    rateLimited(event, "start")
  )
    return errorRedirect(FAILED);
  try {
    const result = await event.backend<{
      state: string;
      authorizeUrl: string;
    }>(`/api/auth/oauth/${provider}/authorize-url`, {
      headers: relayHeaders(event),
    });
    const query = event.url.searchParams;
    event.cookies.writeSealed(
      FLOW,
      {
        state: result.state,
        expiresAt: Date.now() + FLOW_LIFETIME_MS,
        redirect: safePath(query.get("redirect")),
        language: query.get("language") ?? "",
        invite: query.get("invite") ?? "",
      } satisfies OAuthFlow,
      { maxAge: FLOW_LIFETIME_MS / 1000, path: FLOW_PATH },
    );
    return redirect(result.authorizeUrl);
  } catch (error) {
    return failureRedirect(error);
  }
}

function sameState(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function validCallback(flow: OAuthFlow | undefined, query: URLSearchParams) {
  const code = query.get("code");
  const state = query.get("state");
  return Boolean(
    flow &&
      flow.expiresAt >= Date.now() &&
      typeof code === "string" &&
      code.length <= MAX_CALLBACK_PARAMETER_LENGTH &&
      typeof state === "string" &&
      state.length <= MAX_CALLBACK_PARAMETER_LENGTH &&
      sameState(state, flow.state),
  );
}

function storeOAuthResult(
  event: DmsServerEvent,
  provider: string,
  result: OAuthResult,
) {
  const handoff = { maxAge: HANDOFF_LIFETIME_S, path: FLOW_PATH };
  if (result.requires_2fa)
    event.cookies.writeSealed(
      HANDOFF,
      { kind: "2fa", token: result.two_factor_token, methods: result.methods },
      handoff,
    );
  else if (result.requires_tenant_assignment)
    event.cookies.writeSealed(
      HANDOFF,
      {
        kind: "no-workspace",
        token: result.tenant_assignment_token,
        provider,
      },
      handoff,
    );
  else persistAccountSession(event, sessionFrom(result));
}

async function completeOAuth(
  event: DmsServerEvent,
  provider: string,
  flow: OAuthFlow,
): Promise<Response> {
  const query = event.url.searchParams;
  try {
    const result = await event.backend<OAuthResult>(
      `/api/auth/oauth/${provider}/callback`,
      {
        method: "POST",
        headers: relayHeaders(event),
        body: {
          code: query.get("code"),
          state: query.get("state"),
          state_cookie: flow.state,
          language: flow.language || undefined,
          invite: flow.invite || undefined,
        },
      },
    );
    storeOAuthResult(event, provider, result);
    return redirect(
      flow.redirect &&
        !result.requires_2fa &&
        !result.requires_tenant_assignment
        ? `${COMPLETE}?redirect=${encodeURIComponent(flow.redirect)}`
        : COMPLETE,
    );
  } catch (error) {
    return failureRedirect(error);
  }
}

/** `GET /auth/oauth/:provider/callback`: back from the provider. */
export async function oauthCallback(event: DmsServerEvent): Promise<Response> {
  const { provider } = event.params;
  if (!isValidOAuthProvider(provider) || rateLimited(event, "callback"))
    return errorRedirect(FAILED);
  const flow = event.cookies.readSealed<OAuthFlow>(FLOW);
  event.cookies.clear(FLOW, { path: FLOW_PATH });
  const query = event.url.searchParams;
  if (query.has("error")) return errorRedirect("error.oauth.cancelled");
  if (!flow || !validCallback(flow, query))
    return errorRedirect("error.oauth.invalid_state");
  return completeOAuth(event, provider, flow);
}

/**
 * `POST /auth/oauth/handoff`: what the provider sign-in left for the page to
 * finish (a 2FA step, a workspace to pick), once.
 */
export function oauthHandoff(event: DmsServerEvent) {
  const handoff = event.cookies.readSealed(HANDOFF) ?? { kind: "none" };
  event.cookies.clear(HANDOFF, { path: FLOW_PATH });
  return handoff;
}
