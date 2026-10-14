import { randomUUID } from "node:crypto";
import type { DmsServerEvent, DmsSession } from "#dms/server";

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
 * Whether a session, or a stored account, outlives the browser. Only a login
 * that left "keep me signed in" unchecked says no; a cookie written before
 * the flag existed carries none, and keeps the lifetime it was given then.
 */
export function isPersistent(session?: { persistent?: unknown }): boolean {
  return session?.persistent !== false;
}

function lifetime(persistent: boolean): number | undefined {
  return persistent ? MAX_AGE_SECONDS : undefined;
}

function accountCookieName(accountId: string): string {
  if (!UUID.test(accountId)) throw new Error("Invalid account id");
  return `${ACCOUNT_COOKIE_PREFIX}${accountId.replaceAll("-", "")}`;
}

function descriptor(session: DmsSession, accountId: string): AccountDescriptor {
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

export function readAccounts(event: DmsServerEvent): AccountIndex {
  return event.cookies.readSealed<AccountIndex>(ACCOUNT_INDEX_COOKIE) ?? {};
}

function writeAccountIndex(event: DmsServerEvent, accounts: AccountIndex) {
  const persistent = Object.values(accounts).some(isPersistent);
  event.cookies.writeSealed(ACCOUNT_INDEX_COOKIE, accounts, {
    maxAge: lifetime(persistent),
  });
}

export function readAccount(
  event: DmsServerEvent,
  accountId: unknown,
): StoredAccount | undefined {
  if (typeof accountId !== "string" || !UUID.test(accountId)) return undefined;
  return event.cookies.readSealed<StoredAccount>(accountCookieName(accountId));
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

export function removeAccount(event: DmsServerEvent, accountId: unknown) {
  const accounts = { ...readAccounts(event) };
  if (typeof accountId === "string") delete accounts[accountId];
  writeAccountIndex(event, accounts);
  if (typeof accountId === "string" && UUID.test(accountId))
    event.cookies.clear(accountCookieName(accountId));
}
