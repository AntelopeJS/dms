import { useStorage } from "@vueuse/core";
import type {
  StoredAccount,
  SwitchAccountResponse,
  ValidateAccountResponse,
} from "../../types/auth";

const STORAGE_KEY = "antelopejs-accounts";
const SWITCH_ACCOUNT_ENDPOINT = "/auth/switch-account";
const VALIDATE_ACCOUNT_ENDPOINT = "/auth/validate-account";
const HTTP_POST = "POST" as const;

type AccountsRef = ReturnType<typeof useStorage<StoredAccount[]>>;

const accountsStorageByApp = new WeakMap<object, AccountsRef>();

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

  // SAFETY: A newly created effect scope is active, so run synchronously returns this callback's useStorage result.
  const storage = effectScope(true).run(() =>
    useStorage<StoredAccount[]>(STORAGE_KEY, [], undefined),
  ) as AccountsRef;
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

interface UpstreamError {
  status?: number;
  statusCode?: number;
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Request failures can throw arbitrary JavaScript values. FetchError owner types cannot describe every thrown value.
function isTokenRejection(error: unknown): boolean {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- Unchecked projection intentionally preserves property access on primitive errors. It does not establish an UpstreamError contract.
  const { status, statusCode } = (error ?? {}) as UpstreamError;
  const upstreamStatus = statusCode ?? status;
  return (
    upstreamStatus !== undefined && TOKEN_REJECTION_STATUSES.has(upstreamStatus)
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
  const existingIndex = accounts.value.findIndex((a) => a.userId === user._id);
  const account: StoredAccount = {
    accountId,
    userId: user._id,
    email: user.email,
    name: user.name,
    lastUsed: new Date(),
  };

  if (existingIndex >= 0) {
    accounts.value[existingIndex] = account;
  } else {
    accounts.value.push(account);
  }
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
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Refresh results are awaited and discarded. Deriving from the session fetch owner would reject otherwise valid callbacks with other results.
  refreshUser: () => Promise<unknown>,
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
  };
}

export function useMultiAccount() {
  const accounts = useAccountsStorage();
  const {
    user,
    session,
    fetch: refreshUser,
  } = useDmsUserSession<User, BrowserSession>();

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
