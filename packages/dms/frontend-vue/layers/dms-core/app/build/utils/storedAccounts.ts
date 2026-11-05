import type { StoredAccount } from "../../types/auth";

/**
 * Whether `stale` is an entry a recreated user record left behind: the
 * backend refused its token, and a live entry holds its email under another
 * user id. A live entry is never one, since a stored email can be out of date
 * and name another person.
 */
function isRecreatedAs(stale: StoredAccount, current: StoredAccount): boolean {
  return (
    stale.userId !== current.userId &&
    stale.email === current.email &&
    stale.isExpired === true &&
    current.isExpired !== true
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

function lastUsedTime(account: StoredAccount): number {
  return new Date(account.lastUsed).getTime();
}

/**
 * One entry per user, the most recently used one, without the expired entries
 * of user records recreated under the same email.
 */
export function uniqueAccounts(accounts: StoredAccount[]): StoredAccount[] {
  const latest = accounts.reduce<StoredAccount[]>((kept, account) => {
    const previous = kept.find((stored) => stored.userId === account.userId);
    return previous && lastUsedTime(previous) >= lastUsedTime(account)
      ? kept
      : withAccount(kept, account);
  }, []);
  return latest.filter(
    (account) => !latest.some((other) => isRecreatedAs(account, other)),
  );
}
