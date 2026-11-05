import type { StoredAccount } from "../../types/auth";

type AccountIdentity = Pick<StoredAccount, "userId" | "email">;

/**
 * Whether two entries are one person: the same user record, or the same
 * email. The backend holds one user per email, so a second entry with that
 * email is a user record that was deleted and recreated, whose entry the
 * browser kept.
 */
export function isSameAccount(
  left: AccountIdentity,
  right: AccountIdentity,
): boolean {
  return left.userId === right.userId || left.email === right.email;
}

/** `accounts` with `account` in place of every entry of the same person. */
export function withAccount(
  accounts: StoredAccount[],
  account: StoredAccount,
): StoredAccount[] {
  const index = accounts.findIndex((stored) => isSameAccount(stored, account));
  const others = accounts.filter((stored) => !isSameAccount(stored, account));
  if (index < 0) return [...others, account];
  return [...others.slice(0, index), account, ...others.slice(index)];
}

function lastUsedTime(account: StoredAccount): number {
  return new Date(account.lastUsed).getTime();
}

/** One entry per person, the most recently used one. */
export function uniqueAccounts(accounts: StoredAccount[]): StoredAccount[] {
  return accounts.reduce<StoredAccount[]>((kept, account) => {
    const previous = kept.find((stored) => isSameAccount(stored, account));
    return previous && lastUsedTime(previous) >= lastUsedTime(account)
      ? kept
      : withAccount(kept, account);
  }, []);
}
