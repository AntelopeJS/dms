import {
  createHmac,
  createSecretKey,
  type KeyObject,
  timingSafeEqual,
} from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { isString } from "@antelopejs/interface-dms/utils/internal/type-check";
import { type JwtPayload, type SignOptions, sign, verify } from "jsonwebtoken";
import { getAuthConfig } from "../../config";
import { isJwtClaims } from "../../utils";

const SECRET_VERSION = 2;

/**
 * The instance key every user token is signed with. It needs no user, so a
 * token's signature is checked before any account is read.
 */
export function tokenSecret(): KeyObject {
  return createSecretKey(
    `${SECRET_VERSION}:${getAuthConfig().jwtSecret}`,
    "utf8",
  );
}

const USER_KEY_VERSION = 1;

/** The claims a token's `key` MAC covers, in a fixed order. */
const BOUND_CLAIMS = ["id", "purpose", "tenantId", "sessionId", "iat", "exp"];

/**
 * The `key` claim: a MAC over the token's own claims, keyed by the user's
 * `authKey` mixed with the instance secret. Forging it needs the `authKey`,
 * which never leaves the server, and rotating that key invalidates every
 * token issued before.
 *
 * @param authKey The user's current `authKey`
 * @param claims The token's claims, `key` aside
 */
export function userTokenMac(authKey: string, claims: JwtPayload): string {
  const secret = createSecretKey(
    `${USER_KEY_VERSION}:${authKey}:${getAuthConfig().jwtSecret}`,
    "utf8",
  );
  const bound = BOUND_CLAIMS.map((name) => {
    const value: unknown = claims[name];
    return value ?? null;
  });
  return createHmac("sha256", secret)
    .update(JSON.stringify(bound))
    .digest("base64url");
}

/**
 * Signs `claims` for `user`, valid `lifetimeSeconds` from now, with a `key`
 * MAC that binds them to the `authKey` the user holds now.
 */
export function signUserToken(
  user: User,
  claims: JwtPayload,
  lifetimeSeconds: number,
  options: Pick<SignOptions, "jwtid"> = {},
): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload = { ...claims, id: user._id, iat, exp: iat + lifetimeSeconds };
  return sign(
    { ...payload, key: userTokenMac(user.authKey, payload) },
    tokenSecret(),
    options,
  );
}

/**
 * The claims of `token` once its signature checks out, or `null`. Reads no
 * account: a forged token is refused before any user lookup.
 *
 * @param token The token as the client sent it
 */
export function verifyUserToken(token: string): JwtPayload | null {
  try {
    const payload = verify(token, tokenSecret(), { algorithms: ["HS256"] });
    return isJwtClaims(payload) ? payload : null;
  } catch {
    return null;
  }
}

function sameMac(
  authKey: string,
  claims: JwtPayload,
  claimed: string,
): boolean {
  const expected = Buffer.from(userTokenMac(authKey, claims));
  const actual = Buffer.from(claimed);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The user verified `claims` name, when it still exists and their `key` MAC
 * checks out against the `authKey` it holds now.
 *
 * @param claims Claims {@link verifyUserToken} returned
 */
export async function loadTokenUser(
  claims: JwtPayload,
): Promise<User | undefined> {
  if (!isString(claims.id) || !isString(claims.key)) {
    return undefined;
  }
  const user = await GetModel(UserModel).get(claims.id);
  return user && sameMac(user.authKey, claims, claims.key) ? user : undefined;
}
