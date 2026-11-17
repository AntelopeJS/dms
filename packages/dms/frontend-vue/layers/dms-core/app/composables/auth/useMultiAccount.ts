import { useStorage } from "@vueuse/core";
import type {
  StoredAccount,
  SwitchAccountResponse,
  ValidateAccountResponse,
} from "../../types/auth";
import { uniqueAccounts, withAccount } from "../../build/utils/storedAccounts";
import { isNumber } from "../../utils/type-check";

const STORAGE_KEY = "antelopejs-accounts";
const SWITCH_ACCOUNT_ENDPOINT = "/auth/switch-account";
const VALIDATE_ACCOUNT_ENDPOINT = "/auth/validate-account";
const HTTP_POST = "POST" as const;

type AccountsRef = ReturnType<typeof useStorage<StoredAccount[]>>;

const accountsStorageByApp = new WeakMap<object, AccountsRef>();

function dropDuplicates(accounts: AccountsRef) {
  if (!Array.isArray(accounts.value)) return;
  const unique = uniqueAccounts(accounts.value);
  if (unique.length < accounts.value.length) accounts.value = unique;
}

/**
 * The stored accounts, on a ref whose persistence outlives any component.
 *
 * `useStorage` registers its write watcher on the calling effect scope, so a
 * ref created straight from a page's `setup` stops being written the moment
 * that page unmounts. Account validation runs fire-and-forget on the switcher
 * page and adopts a rotated refresh token when one comes back: navigating away
 * mid-flight would drop that write, while the backend has already invalidated
 * the token still sitting in storage — the account would silently need a full
 * re-login. A detached scope keeps writes flowing whatever the caller's life.
 */
function useAccountsStorage(): AccountsRef {
  const dmsApp = useDmsApp();
  const existing = accountsStorageByApp.get(dmsApp);
  if (existing) return existing;

  const storage = effectScope(true).run(() =>
    useStorage<StoredAccount[]>(STORAGE_KEY, [], undefined),
  );
  if (!storage) throw new Error("The accounts storage scope is inactive");
  dropDuplicates(storage);
  accountsStorageByApp.set(dmsApp, storage);
  return storage;
}

interface MinimalUser {
  _id: string;
  email: string;
  name: string;
}

interface BrowserSession {
  accountId: string;
  activeTenantId?: string;
}

const TOKEN_REJECTION_STATUSES = new Set([400, 401, 403]);

/** A thrown value whose upstream status, `statusCode` or else `status`, is a number. */
type UpstreamError = { statusCode: number } | { status: number };

/** Whether `error` is the backend refusing the account's tokens: a 400, 401 or 403. */
function isTokenRejection(error: unknown): error is UpstreamError {
  if (typeof error !== "object" && typeof error !== "function") return false;
  if (error === null) return false;
  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  const upstreamStatus =
    statusCode ?? ("status" in error ? error.status : undefined);
  return (
    isNumber(upstreamStatus) && TOKEN_REJECTION_STATUSES.has(upstreamStatus)
  );
}

function buildActiveAccount(
  user: MinimalUser | null | undefined,
  accountId: string | undefined,
): StoredAccount | undefined {
  if (!user || !accountId) {
    return undefined;
  }
  return {
    accountId,
    userId: user._id,
    email: user.email,
    name: user.name,
    lastUsed: new Date(),
    isExpired: false,
  };
}

function upsertAccount(
  accounts: AccountsRef,
  user: MinimalUser,
  accountId: string,
) {
  accounts.value = withAccount(accounts.value, {
    accountId,
    userId: user._id,
    email: user.email,
    name: user.name,
    lastUsed: new Date(),
  });
}

async function requestAccountSwitch(account: StoredAccount) {
  await $fetch<SwitchAccountResponse>(SWITCH_ACCOUNT_ENDPOINT, {
    method: HTTP_POST,
    body: { accountId: account.accountId },
  });

  account.lastUsed = new Date();
  account.isExpired = false;
}

/**
 * Moves what the browser shows to the session it switched to. The session
 * read again moves the data scope (the previous account's data is dropped)
 * and drops the prefetched pages; the site layout and the page come back
 * through Inertia, whose once prop is keyed on the account and workspace.
 *
 * @internal
 */
export async function refreshSessionSurfaces(
  refreshUser: () => Promise<any>,
): Promise<void> {
  await refreshUser();

  const { resync: reloadSiteLayout } = useSiteLayout();
  const { clear: clearPermissions } = usePermissions();
  clearPermissions();
  await reloadSiteLayout();
}

export async function validateAccount(account: StoredAccount) {
  const response = await $fetch<ValidateAccountResponse>(
    VALIDATE_ACCOUNT_ENDPOINT,
    {
      method: HTTP_POST,
      body: { accountId: account.accountId },
    },
  ).catch(() => undefined);

  if (!response || response.valid === null) {
    return;
  }

  account.isExpired = !response.valid;
}

function createSwitchAccount(
  accounts: AccountsRef,
  addCurrentAccount: () => void,
  refreshUser: Parameters<typeof refreshSessionSurfaces>[0],
) {
  return async function switchAccount(userId: string) {
    const account = accounts.value.find((a) => a.userId === userId);
    if (!account) {
      return;
    }

    addCurrentAccount();

    try {
      await requestAccountSwitch(account);
    } catch (error) {
      if (isTokenRejection(error)) {
        account.isExpired = true;
        dropDuplicates(accounts);
      }
      throw error;
    }

    await refreshSessionSurfaces(refreshUser);
  };
}

function createValidateAllAccounts(
  accounts: AccountsRef,
  getCurrentUserId: () => string | undefined,
) {
  return async function validateAllAccounts() {
    const currentUserId = getCurrentUserId();
    await Promise.allSettled(
      accounts.value
        .filter((a) => a.userId !== currentUserId)
        .map((account) => validateAccount(account)),
    );
    dropDuplicates(accounts);
  };
}

export function useMultiAccount() {
  const accounts = useAccountsStorage();
  const userSession = useDmsUserSession<User, BrowserSession>();
  const { user, session } = userSession;
  const refreshUser = () => userSession.fetch();

  const getActiveAccount = (): StoredAccount | undefined =>
    buildActiveAccount(user.value, session.value?.accountId);

  const addCurrentAccount = () => {
    if (!user.value || !session.value) {
      return;
    }
    const accountId = session.value.accountId;
    if (accountId) upsertAccount(accounts, user.value, accountId);
  };

  const removeAccount = async (userId: string): Promise<void> => {
    const account = accounts.value.find((item) => item.userId === userId);
    if (account) {
      await $fetch("/auth/remove-account", {
        method: "POST",
        body: { accountId: account.accountId },
      });
    }
    accounts.value = accounts.value.filter((a) => a.userId !== userId);
  };

  const syncActiveAccount = () => {
    const currentUser = user.value;
    if (!currentUser) {
      return;
    }
    const stored = accounts.value.find((a) => a.userId === currentUser._id);
    if (!stored) {
      return;
    }
    stored.name = currentUser.name;
    stored.email = currentUser.email;
  };

  const switchAccount = createSwitchAccount(
    accounts,
    addCurrentAccount,
    refreshUser,
  );
  const validateAllAccounts = createValidateAllAccounts(
    accounts,
    () => user.value?._id,
  );

  return {
    accounts,
    getActiveAccount,
    addCurrentAccount,
    removeAccount,
    syncActiveAccount,
    switchAccount,
    validateAllAccounts,
  };
}
