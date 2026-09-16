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

// Keyed on the DMS app rather than the module, so an SSR request never sees
// another one's ref.
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

// Same statuses the validate-account route treats as a verdict on the token;
// the two paths must agree on what "expired" means, or the switcher shows a
// badge its own validation would not have set.
const TOKEN_REJECTION_STATUSES = new Set([400, 401, 403]);

interface UpstreamError {
  status?: number;
  statusCode?: number;
}

function isTokenRejection(error: unknown): boolean {
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
  } as StoredAccount;
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

async function refreshSessionSurfaces(refreshUser: () => Promise<unknown>) {
  await refreshUser();

  const { refresh: refreshSiteLayout } = useSiteLayout();
  const { clear: clearPermissions } = usePermissions();
  clearPermissions();
  await refreshSiteLayout();
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
  refreshUser: () => Promise<unknown>,
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
      // Only a verdict on the token expires the account. A 500, a timeout or
      // an unreachable backend says nothing about it, and painting a healthy
      // account "Session expired" is exactly what the three-state verdict in
      // `validateAccount` exists to avoid — the switch path must agree with it.
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
  const { user, session, fetch: refreshUser } =
    useUserSession<User, BrowserSession>();

  const getActiveAccount = (): StoredAccount | undefined =>
    buildActiveAccount(
      user.value,
      session.value?.accountId as string | undefined,
    );

  const addCurrentAccount = () => {
    if (!user.value || !session.value) {
      return;
    }
    const accountId = session.value.accountId as string | undefined;
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
