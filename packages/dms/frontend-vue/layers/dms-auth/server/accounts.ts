import { randomUUID } from "node:crypto";
import type { DmsServerEvent, DmsSession } from "#dms/server";
import {
  isBoolean,
  isObject,
  isString,
} from "../../dms-core/app/utils/type-check";

/**
 * The accounts this browser is signed in to: an index of their descriptors,
 * and one sealed cookie per account holding its refresh token. The frontend
 * server scopes and seals the cookies; their names and contents are the DMS's,
 * unchanged from when the renderer wrote them, so stored accounts survive the
 * move.
 */

const ACCOUNT_INDEX_COOKIE = "dms_account_index";
const ACCOUNT_COOKIE_PREFIX = "dms_account_";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AccountDescriptor {
  accountId: string;
  userId?: string;
  email?: string;
  name?: string;
  activeTenantId?: string;
  persistent: boolean;
}

export interface StoredAccount extends AccountDescriptor {
  refreshToken?: string;
}

type AccountIndex = Record<string, AccountDescriptor>;

interface SessionUser {
  _id?: string;
  id?: string;
  email?: string;
  name?: string;
}

/**
 * Whether a session, or a stored account, outlives the browser: only one a
 * login that ticked "keep me signed in" wrote (`persistent: true`).
 */
export function isPersistent(session?: { persistent?: unknown }): boolean {
  return session?.persistent === true;
}

function lifetime(persistent: boolean): number | undefined {
  return persistent ? MAX_AGE_SECONDS : undefined;
}

function accountCookieName(accountId: string): string {
  if (!UUID.test(accountId)) throw new Error("Invalid account id");
  return `${ACCOUNT_COOKIE_PREFIX}${accountId.replaceAll("-", "")}`;
}

function descriptor(session: DmsSession, accountId: string): AccountDescriptor {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The session owner does not prove these optional legacy user fields are strings. This preserves the existing unchecked descriptor projection; parsing or coercing them would change stored account payloads.
  const user = (session.user ?? {}) as SessionUser;
  return {
    accountId,
    userId: user._id ?? user.id,
    email: user.email,
    name: user.name,
    activeTenantId: session.activeTenantId,
    persistent: isPersistent(session),
  };
}

function isOptionalText(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isAccountDescriptor(value: unknown): value is AccountDescriptor {
  return (
    isObject(value) &&
    value !== null &&
    !Array.isArray(value) &&
    isString(value.accountId) &&
    isOptionalText(value.userId) &&
    isOptionalText(value.email) &&
    isOptionalText(value.name) &&
    isOptionalText(value.activeTenantId) &&
    isBoolean(value.persistent)
  );
}

function isStoredAccount(value: unknown): value is StoredAccount {
  return (
    isAccountDescriptor(value) &&
    isObject(value) &&
    isOptionalText(value.refreshToken)
  );
}

function isAccountIndex(value: unknown): value is AccountIndex {
  return (
    isObject(value) &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isAccountDescriptor)
  );
}

export function readAccounts(event: DmsServerEvent): AccountIndex {
  return event.cookies.readSealed(ACCOUNT_INDEX_COOKIE, isAccountIndex) ?? {};
}

function writeAccountIndex(event: DmsServerEvent, accounts: AccountIndex) {
  const persistent = Object.values(accounts).some(isPersistent);
  event.cookies.writeSealed(ACCOUNT_INDEX_COOKIE, accounts, {
    maxAge: lifetime(persistent),
  });
}

export function readAccount(
  event: DmsServerEvent,
  accountId: Parameters<typeof isString>[0],
): StoredAccount | undefined {
  if (!isString(accountId) || !UUID.test(accountId)) return undefined;
  return event.cookies.readSealed(accountCookieName(accountId), isStoredAccount);
}

export function storeAccount(
  event: DmsServerEvent,
  session: DmsSession,
  accountId?: string,
): AccountDescriptor {
  const id = accountId ?? randomUUID();
  const account = descriptor(session, id);
  writeAccountIndex(event, { ...readAccounts(event), [id]: account });
  event.cookies.writeSealed(
    accountCookieName(id),
    { refreshToken: session.refreshToken, ...account },
    { maxAge: lifetime(account.persistent) },
  );
  return account;
}

function assertAccountInvariant(session: DmsSession, accountId: string) {
  if (!accountId || session.accountId !== accountId)
    throw new Error("Account session invariant violated");
}

/**
 * Write `session` as the current one, and as one of the stored accounts. The
 * frontend server stamps it with `updatedAt`, which lets the browser tell a
 * page fetched before this write, and restored from its cache, from a
 * current one.
 */
export function persistAccountSession(
  event: DmsServerEvent,
  session: DmsSession,
  accountId?: string,
): AccountDescriptor {
  const id = accountId ?? session.accountId ?? randomUUID();
  session.accountId = id;
  const account = storeAccount(event, session, id);
  assertAccountInvariant(session, account.accountId);
  event.session.write(session);
  return account;
}

export function removeAccount(
  event: DmsServerEvent,
  accountId: Parameters<typeof readAccount>[1],
) {
  const accounts = { ...readAccounts(event) };
  if (isString(accountId)) delete accounts[accountId];
  writeAccountIndex(event, accounts);
  if (isString(accountId) && UUID.test(accountId))
    event.cookies.clear(accountCookieName(accountId));
}
