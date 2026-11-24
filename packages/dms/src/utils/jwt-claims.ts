import type { JwtPayload } from "jsonwebtoken";

/**
 * Narrows what `verify` returned to a claims object. It can return a text
 * payload, which carries no named claims.
 *
 * @param payload Value returned by `verify`
 * @returns Whether the payload is a claims object
 */
export function isJwtClaims(
  payload: string | JwtPayload | null,
): payload is JwtPayload {
  return payload instanceof Object;
}
