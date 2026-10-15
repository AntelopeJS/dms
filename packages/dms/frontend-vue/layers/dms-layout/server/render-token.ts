import { createHmac, timingSafeEqual } from "node:crypto";

// The service token that guards the HTML render route, minted by the DMS
// backend (`service-jwt.ts`) for its own render requests: its signature, its
// claims and its single use.

const RENDER_TOKEN_LIFETIME_SECONDS = 5 * 60;
const RENDER_REPLAY_LIMIT = 10_000;

interface RenderTokenClaims {
  namespace?: unknown;
  purpose?: unknown;
  aud?: unknown;
  jti?: unknown;
  iat?: unknown;
  exp?: unknown;
}

/** jti -> exp, for tokens already spent. Pruned on every accepted token. */
const usedRenderTokens = new Map<string, number>();

/**
 * Constant-time check of the token's HMAC. The length comparison guards
 * timingSafeEqual, which throws on mismatched lengths; it is not itself a
 * timing leak, since the length of a base64url HMAC is fixed.
 */
function signatureValid(parts: string[], secret: string): boolean {
  const expected = createHmac("sha256", secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64url");
  if (expected.length !== parts[2].length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]));
}

/**
 * The claims this service accepts. `exp - iat` is bounded so a token minted
 * with a far-future expiry cannot outlive the intended window.
 */
function claimsValid(
  payload: RenderTokenClaims,
  now: number,
): payload is RenderTokenClaims & { jti: string; exp: number } {
  return (
    payload.namespace === "html-render-service" &&
    payload.purpose === "html-render" &&
    payload.aud === "dms-frontend" &&
    typeof payload.jti === "string" &&
    payload.jti.length >= 16 &&
    Number.isSafeInteger(payload.iat) &&
    Number.isSafeInteger(payload.exp) &&
    (payload.exp as number) > now &&
    (payload.exp as number) - (payload.iat as number) <=
      RENDER_TOKEN_LIFETIME_SECONDS &&
    (payload.iat as number) <= now
  );
}

/**
 * Records a token as spent, dropping expired entries first and evicting the
 * oldest if the map is at its cap, so a flood of tokens cannot grow it without
 * bound.
 */
function rememberToken(jti: string, exp: number, now: number) {
  for (const [spent, expiresAt] of usedRenderTokens)
    if (expiresAt <= now) usedRenderTokens.delete(spent);
  while (usedRenderTokens.size >= RENDER_REPLAY_LIMIT)
    usedRenderTokens.delete(usedRenderTokens.keys().next().value as string);
  usedRenderTokens.set(jti, exp);
}

/**
 * Whether the token is well-formed, signed with `secret`, unexpired and not
 * already spent. A token accepted here is immediately marked as spent.
 */
export function validRenderToken(
  token: string | null,
  secret: string | undefined,
): boolean {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  if (!signatureValid(parts, secret)) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as RenderTokenClaims;
    const now = Math.floor(Date.now() / 1000);
    if (!claimsValid(payload, now)) return false;
    if (usedRenderTokens.has(payload.jti)) return false;
    rememberToken(payload.jti, payload.exp, now);
    return true;
  } catch {
    return false;
  }
}
