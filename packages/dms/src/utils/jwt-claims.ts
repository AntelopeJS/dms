import { decode, type JwtPayload } from "jsonwebtoken";

/**
 * Narrows what `decode` or `verify` returned to a claims object. Both can
 * return a text payload, which carries no named claims.
 *
 * @param payload Value returned by `decode` or `verify`
 * @returns Whether the payload is a claims object
 */
export function isJwtClaims(
  payload: string | JwtPayload | null,
): payload is JwtPayload {
  return payload instanceof Object;
}

/**
 * Reads a token's payload without verifying it, as `decode` does, but answers
 * `null` for a `typ: "JWT"` token whose payload is not JSON, on which `decode`
 * throws, as for any other token it cannot read.
 *
 * @param token The token as the client sent it
 */
export function decodeUnverified(token: string): ReturnType<typeof decode> {
  try {
    return decode(token);
  } catch {
    return null;
  }
}
