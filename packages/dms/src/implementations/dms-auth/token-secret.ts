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

/**
 * The `key` claim that binds a token to the `authKey` it was issued under, so
 * rotating the key invalidates every token issued before.
 */
export function authKeyFingerprint(authKey: string): string {
  return createHmac("sha256", tokenSecret())
    .update(`authKey:${authKey}`)
    .digest("base64url");
}

/**
 * Signs `claims` for `user`, naming the user and the `authKey` it holds now.
 */
export function signUserToken(
  user: User,
  claims: JwtPayload,
  options: SignOptions,
): string {
  return sign(
    { ...claims, id: user._id, key: authKeyFingerprint(user.authKey) },
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

function sameFingerprint(authKey: string, claimed: string): boolean {
  const expected = Buffer.from(authKeyFingerprint(authKey));
  const actual = Buffer.from(claimed);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * The user verified `claims` name, when it still exists and still holds the
 * `authKey` the token was issued under.
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
  return user && sameFingerprint(user.authKey, claims.key) ? user : undefined;
}
