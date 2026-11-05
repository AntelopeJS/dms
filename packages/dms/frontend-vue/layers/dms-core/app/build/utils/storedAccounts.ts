import type { StoredAccount } from "../../types/auth";

function lastUsedTime(account: StoredAccount): number {
  return new Date(account.lastUsed).getTime();
}

function isRefused(account: StoredAccount): boolean {
  return account.isExpired === true;
}

/** Whether `account` is the better of two entries: live first, then newest. */
function isPreferred(account: StoredAccount, other: StoredAccount): boolean {
  if (isRefused(account) !== isRefused(other)) return isRefused(other);
  return lastUsedTime(account) > lastUsedTime(other);
}

/**
 * Whether `stale` is an entry a recreated user record left behind: the
 * backend refused its token, and a better entry holds its email under another
 * user id. A live entry is never one, since a stored email can be out of date
 * and name another person.
 */
function isRecreatedAs(stale: StoredAccount, current: StoredAccount): boolean {
  return (
    stale.userId !== current.userId &&
    stale.email === current.email &&
    isRefused(stale) &&
    isPreferred(current, stale)
  );
}

function isReplacedBy(stored: StoredAccount, account: StoredAccount): boolean {
  return stored.userId === account.userId || isRecreatedAs(stored, account);
}

/** `accounts` with `account` in place of every entry it replaces. */
export function withAccount(
  accounts: StoredAccount[],
  account: StoredAccount,
): StoredAccount[] {
  const index = accounts.findIndex((stored) => isReplacedBy(stored, account));
  const others = accounts.filter((stored) => !isReplacedBy(stored, account));
  if (index < 0) return [...others, account];
  return [...others.slice(0, index), account, ...others.slice(index)];
}

/**
 * One entry per user, the preferred one, without the refused entries of user
 * records recreated under the same email.
 */
export function uniqueAccounts(accounts: StoredAccount[]): StoredAccount[] {
  const byUser = new Map<string, StoredAccount>();
  for (const account of accounts) {
    const kept = byUser.get(account.userId);
    if (!kept || isPreferred(account, kept))
      byUser.set(account.userId, account);
  }
  const perUser = [...byUser.values()];
  return perUser.filter(
    (account) => !perUser.some((other) => isRecreatedAs(account, other)),
  );
}
