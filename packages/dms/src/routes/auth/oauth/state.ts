import { randomBytes, timingSafeEqual } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import { sign, verify } from "jsonwebtoken";
import { getAuthConfig } from "../../../config";

const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;
const INVALID_STATE_MESSAGE = "error.oauth.invalid_state";
const JWT_SECRET_MISSING_MESSAGE = "error.oauth.jwt_secret_missing";

const STATE_PURPOSE = "oauth-state";
const STATE_NONCE_BYTES = 16;
const SECONDS_IN_MINUTE = 60;
const STATE_LIFETIME_MINUTES = 10;
const STATE_LIFETIME_SECONDS = STATE_LIFETIME_MINUTES * SECONDS_IN_MINUTE;

interface OAuthStateClaims {
  provider?: string;
  nonce?: string;
  purpose?: string;
}

const MILLISECONDS_IN_SECOND = 1000;
const CONSUMED_NONCE_TTL_MS = STATE_LIFETIME_SECONDS * MILLISECONDS_IN_SECOND;

const consumedNonces = new Map<string, number>();

function sweepConsumedNonces(now: number): void {
  for (const [nonce, expiresAt] of consumedNonces) {
    if (expiresAt <= now) {
      consumedNonces.delete(nonce);
    }
  }
}

/**
 * Burn a state's nonce so the same state cannot complete two logins. The
 * registry is in-memory and per-process — like the route rate limiter — so a
 * replay on another instance of a multi-instance deployment is not caught;
 * signature, expiry and the browser cookie check still apply there.
 */
function consumeNonce(nonce: string): boolean {
  const now = Date.now();
  sweepConsumedNonces(now);

  if (consumedNonces.has(nonce)) {
    return false;
  }

  consumedNonces.set(nonce, now + CONSUMED_NONCE_TTL_MS);
  return true;
}

function getStateSecret(): string {
  const { jwtSecret } = getAuthConfig();
  assert(jwtSecret, HTTP_INTERNAL_ERROR, JWT_SECRET_MISSING_MESSAGE);
  return `${STATE_PURPOSE}:${jwtSecret}`;
}

function isSameState(state: string, cookieState: string): boolean {
  const left = Buffer.from(state);
  const right = Buffer.from(cookieState);
  return left.length === right.length && timingSafeEqual(left, right);
}

function decodeState(state: string): OAuthStateClaims | undefined {
  try {
    // The source and the target do not overlap, so this cannot be one
    // assertion: the value reaches here through a decorator, a JWT
    // payload or a filter tuple, none of which the type system sees.
    // oxlint-disable-next-line anti-slop/no-chained-type-assertions
    return verify(state, getStateSecret()) as unknown as OAuthStateClaims;
  } catch {
    return undefined;
  }
}

/**
 * Mint the `state` parameter carried through the provider round-trip. The
 * caller stores it in a browser cookie so the callback can prove the response
 * belongs to the browser that started the flow.
 *
 * @param providerId Provider the flow targets
 * @returns Signed state parameter
 */
export function signOAuthState(providerId: string): string {
  const claims = {
    provider: providerId,
    nonce: randomBytes(STATE_NONCE_BYTES).toString("hex"),
    purpose: STATE_PURPOSE,
  };
  return sign(claims, getStateSecret(), { expiresIn: STATE_LIFETIME_SECONDS });
}

/**
 * Validate a callback `state` against the one the browser kept, and consume
 * it: a state completes at most one login, so an intercepted state/cookie
 * pair cannot be replayed.
 *
 * Rejects a forged, expired, cross-provider, unmatched or already-used state.
 * The state/cookie equality is only meaningful on the browser path, where the
 * cookie was set by the flow's own start route; a direct API caller supplies
 * both values and proves nothing — browser binding lives in the layer that
 * owns the cookie, by construction.
 *
 * @param state State returned by the provider
 * @param cookieState State the browser stored when the flow started
 * @param providerId Provider handling the callback
 */
export function assertValidOAuthState(
  state: string,
  cookieState: string,
  providerId: string,
): void {
  assert(
    isSameState(state, cookieState),
    HTTP_BAD_REQUEST,
    INVALID_STATE_MESSAGE,
  );

  const claims = decodeState(state);
  assert(
    claims?.purpose === STATE_PURPOSE &&
      claims.provider === providerId &&
      claims.nonce,
    HTTP_BAD_REQUEST,
    INVALID_STATE_MESSAGE,
  );
  assert(consumeNonce(claims.nonce), HTTP_BAD_REQUEST, INVALID_STATE_MESSAGE);
}
