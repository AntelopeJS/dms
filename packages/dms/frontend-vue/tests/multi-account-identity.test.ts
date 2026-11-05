/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useMultiAccount } from "../layers/dms-core/app/composables/auth/useMultiAccount";

const STORAGE_KEY = "antelopejs-accounts";

interface SeededAccount {
  accountId: string;
  userId: string;
  email: string;
  name: string;
  lastUsed: string;
  isExpired?: boolean;
}

function seeded(overrides: Partial<SeededAccount>): SeededAccount {
  return {
    accountId: "account-old",
    userId: "user-old",
    email: "ada@example.com",
    name: "Ada",
    lastUsed: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function seed(...accounts: SeededAccount[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}

function signedIn(
  user: { _id: string; email: string; name: string },
  accountId: string,
) {
  vi.stubGlobal("useDmsUserSession", () => ({
    user: ref(user),
    session: ref({ accountId }),
    fetch: vi.fn(),
  }));
}

function storedUserIds(): string[] {
  const stored: SeededAccount[] = JSON.parse(
    localStorage.getItem(STORAGE_KEY) ?? "[]",
  );
  return stored.map((account) => account.userId);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("useDmsApp", () => ({}));
  vi.stubGlobal("effectScope", effectScope);
  signedIn(
    { _id: "user-new", email: "ada@example.com", name: "Ada" },
    "account-new",
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "$fetch");
});

describe("useMultiAccount account identity", () => {
  it("replaces the entry of a person who signs in again under a new user record", async () => {
    seed(seeded({ isExpired: true }));
    const { accounts, addCurrentAccount } = useMultiAccount();

    addCurrentAccount();
    await nextTick();

    expect(accounts.value.map((account) => account.userId)).toEqual([
      "user-new",
    ]);
    expect(storedUserIds()).toEqual(["user-new"]);
  });

  it("collapses entries already stored twice for one person, keeping the most recently used live one", async () => {
    seed(
      seeded({
        userId: "user-a",
        accountId: "account-a",
        lastUsed: "2026-01-01T00:00:00.000Z",
        isExpired: true,
      }),
      seeded({
        userId: "user-b",
        accountId: "account-b",
        lastUsed: "2026-03-01T00:00:00.000Z",
      }),
      seeded({
        userId: "user-c",
        accountId: "account-c",
        lastUsed: "2026-04-01T00:00:00.000Z",
        isExpired: true,
      }),
      seeded({
        userId: "user-b",
        accountId: "account-b2",
        lastUsed: "2026-02-15T00:00:00.000Z",
      }),
    );

    const { accounts } = useMultiAccount();
    await nextTick();

    expect(accounts.value.map((account) => account.accountId)).toEqual([
      "account-b",
    ]);
    expect(storedUserIds()).toEqual(["user-b"]);
  });

  it("keeps two people apart when only their names match", async () => {
    seed(seeded({ userId: "user-other", email: "ada.other@example.com" }));
    const { accounts, addCurrentAccount } = useMultiAccount();

    addCurrentAccount();
    await nextTick();

    expect(accounts.value.map((account) => account.userId)).toEqual([
      "user-other",
      "user-new",
    ]);
  });

  it("keeps a live account whose stored email now names another user", async () => {
    seed(seeded({ userId: "user-moved" }));
    const { accounts, addCurrentAccount } = useMultiAccount();

    addCurrentAccount();
    await nextTick();

    expect(accounts.value.map((account) => account.userId)).toEqual([
      "user-moved",
      "user-new",
    ]);
  });

  it("drops the leftover of a recreated user record once validation finds it refused", async () => {
    seed(seeded({}));
    Reflect.set(
      globalThis,
      "$fetch",
      vi.fn(async () => ({ valid: false })),
    );
    const { accounts, addCurrentAccount, validateAllAccounts } =
      useMultiAccount();
    addCurrentAccount();

    await validateAllAccounts();
    await nextTick();

    expect(accounts.value.map((account) => account.userId)).toEqual([
      "user-new",
    ]);
    expect(storedUserIds()).toEqual(["user-new"]);
  });

  it("leaves a stored value that is not a list to the pages that read it", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ broken: true }));

    expect(() => useMultiAccount()).not.toThrow();
  });
});
