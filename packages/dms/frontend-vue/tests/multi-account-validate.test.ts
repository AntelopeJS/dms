import { afterEach, describe, expect, it, vi } from "vitest";
import { validateAccount } from "../layers/dms-core/app/composables/auth/useMultiAccount";
import type { StoredAccount } from "../layers/dms-core/app/types/auth";

function makeAccount(overrides: Partial<StoredAccount> = {}): StoredAccount {
  return {
    accountId: "account-1",
    userId: "user-1",
    email: "user@example.com",
    name: "User",
    lastUsed: new Date(0),
    ...overrides,
  };
}

function stubFetch(implementation: () => Promise<unknown>) {
  const fetchMock = vi.fn(implementation);
  (globalThis as Record<string, unknown>).$fetch = fetchMock;
  return fetchMock;
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).$fetch;
});

describe("validateAccount", () => {
  it("posts only the opaque account identifier to the validate endpoint", async () => {
    const fetchMock = stubFetch(async () => ({ valid: true }));

    await validateAccount(makeAccount());

    expect(fetchMock).toHaveBeenCalledWith("/auth/validate-account", {
      method: "POST",
      body: { accountId: "account-1" },
    });
  });

  it("keeps the account expired when the endpoint answers 200 { valid: false }", async () => {
    stubFetch(async () => ({ valid: false }));

    const account = makeAccount({ isExpired: true });
    await validateAccount(account);

    expect(account.isExpired).toBe(true);
  });

  it("marks a previously valid account expired when validation fails", async () => {
    stubFetch(async () => ({ valid: false }));

    const account = makeAccount({ isExpired: false });
    await validateAccount(account);

    expect(account.isExpired).toBe(true);
  });

  it("clears the expired flag when the token is valid", async () => {
    stubFetch(async () => ({ valid: true }));

    const account = makeAccount({ isExpired: true });
    await validateAccount(account);

    expect(account.isExpired).toBe(false);
  });

  it("ignores token-shaped data from a failed validation", async () => {
    stubFetch(async () => ({
      valid: false,
      refresh_token: "should-not-be-used",
    }));

    const account = makeAccount();
    await validateAccount(account);

    expect(account.isExpired).toBe(true);
    expect(account).not.toHaveProperty("refreshToken");
  });

  it("leaves the stored state untouched on an indeterminate verdict", async () => {
    stubFetch(async () => ({ valid: null }));

    const account = makeAccount({ isExpired: true });
    await validateAccount(account);

    expect(account.isExpired).toBe(true);
    expect(account).not.toHaveProperty("refreshToken");
  });

  it("leaves the stored state untouched when the request itself throws", async () => {
    stubFetch(async () => {
      throw new Error("network down");
    });

    const account = makeAccount({ isExpired: false });
    await validateAccount(account);

    expect(account.isExpired).toBe(false);
    expect(account).not.toHaveProperty("refreshToken");
  });
});
