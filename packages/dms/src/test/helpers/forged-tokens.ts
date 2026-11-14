import crypto, { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  SessionModel,
  type User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { assert, expect } from "chai";
import { decode, type JwtPayload, sign } from "jsonwebtoken";
import {
  tokenSecret,
  userTokenMac,
} from "../../implementations/dms-auth/services";
import { isJwtClaims } from "../../utils";

const TENANT_ID = "forged-claims-tenant";

export const HTTP_UNAUTHORIZED = 401;
export const UNKNOWN_USER_ID = "no-such-user";

/** A token whose header says JWT and whose payload is not JSON. */
export const MALFORMED_PAYLOAD_TOKEN = [
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
  Buffer.from("not json{").toString("base64url"),
  Buffer.from("signature").toString("base64url"),
].join(".");

export const EXPIRED = { exp: Math.floor(Date.now() / 1000) - 60 };

interface Refusal {
  status: number;
  body: unknown;
}

/** The status and body of the `HTTPResult` that `run` must throw. */
export async function refusalOf<T>(run: () => Promise<T>): Promise<Refusal> {
  try {
    await run();
  } catch (error) {
    assert.instanceOf(error, HTTPResult);
    return { status: error.getStatus(), body: error.getBody() };
  }
  return expect.fail("Expected authentication to reject the token");
}

/** A token carrying `claims`, signed with a key no user has. */
export function forge(claims: JwtPayload): string {
  return sign({ tenantId: TENANT_ID, ...claims }, "forged-secret");
}

const TOKEN_LIFETIME_SECONDS = 3600;

/** A token carrying `claims`, signed for `user` with the instance key. */
export function signFor(user: User, claims: JwtPayload): string {
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    id: user._id,
    tenantId: TENANT_ID,
    iat,
    exp: iat + TOKEN_LIFETIME_SECONDS,
    ...claims,
  };
  return sign(
    { ...payload, key: userTokenMac(user.authKey, payload) },
    tokenSecret(),
  );
}

/**
 * A token signed with the instance key that reuses the `key` claim of
 * `captured` over new `claims`, as someone who knows `jwtSecret` would.
 */
export function reuseKeyOf(captured: string, claims: JwtPayload): string {
  const decoded = decode(captured);
  assert(isJwtClaims(decoded), "captured token carries claims");
  const key: unknown = decoded.key;
  return sign({ tenantId: TENANT_ID, ...claims, key }, tokenSecret(), {
    expiresIn: TOKEN_LIFETIME_SECONDS * 24,
  });
}

/**
 * `token` signed again with the instance key, its claims in reverse order and
 * `overrides` applied, as someone who knows `jwtSecret` would.
 */
export function resign(token: string, overrides: JwtPayload = {}): string {
  const decoded = decode(token);
  assert(isJwtClaims(decoded), "token carries claims");
  const reversed = Object.fromEntries(Object.entries(decoded).reverse());
  return sign({ ...reversed, ...overrides }, tokenSecret());
}

/** Stores a validated owner for token tests to name. */
export async function insertTokenUser(): Promise<User> {
  const model = GetModel(UserModel);
  const [id] = await model.insert({
    email: `${randomUUID()}@forged-claims.test`,
    name: "Forged claims test",
    authKey: randomUUID(),
    isValidated: true,
    owner: true,
    language: "en",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const created = await model.get(id);
  if (!created) throw new Error("Failed to create forged-claims user");
  return created;
}

/** How many HMACs `run` computed: the work verifying a token costs. */
export async function hmacsDuring(run: () => Promise<void>): Promise<number> {
  const createHmac = crypto.createHmac;
  let count = 0;
  Reflect.set(
    crypto,
    "createHmac",
    (...args: Parameters<typeof createHmac>) => {
      count++;
      return createHmac(...args);
    },
  );
  try {
    await run();
  } finally {
    Reflect.set(crypto, "createHmac", createHmac);
  }
  return count;
}

/** The ids every user lookup asked for while `run` ran. */
export async function userReadsDuring(
  run: () => Promise<void>,
): Promise<string[]> {
  const model = GetModel(UserModel);
  const get = model.get.bind(model);
  const reads: string[] = [];
  model.get = async (...args: Parameters<UserModel["get"]>) => {
    reads.push(String(args[0]));
    return get(...args);
  };
  try {
    await run();
  } finally {
    Reflect.deleteProperty(model, "get");
  }
  return reads;
}

/** The ids every session lookup asked for while `run` ran. */
export async function sessionLookupsDuring(
  run: () => Promise<void>,
): Promise<string[]> {
  const model = GetModel(SessionModel);
  const get = model.get.bind(model);
  const lookups: string[] = [];
  model.get = async (...args: Parameters<SessionModel["get"]>) => {
    lookups.push(String(args[0]));
    return get(...args);
  };
  try {
    await run();
  } finally {
    Reflect.deleteProperty(model, "get");
  }
  return lookups;
}
