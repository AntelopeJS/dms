import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useSessionHandoff } from "../layers/dms-layout/app/build/composables/security/useSessionHandoff";

const addCurrentAccount = vi.fn();
const refreshUser = vi.fn(async () => {});
const fetchCalls: Array<[string, unknown]> = [];

vi.mock("#dms-core/app/composables/auth/useMultiAccount", () => ({
  useMultiAccount: () => ({ addCurrentAccount }),
}));

beforeEach(() => {
  fetchCalls.length = 0;
  addCurrentAccount.mockClear();
  refreshUser.mockClear();
  vi.stubGlobal("$fetch", async (url: string, options: unknown) => {
    fetchCalls.push([url, options]);
    return {};
  });
  vi.stubGlobal("useUserSession", () => ({
    session: ref({ accountId: "account-before" }),
    fetch: refreshUser,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("reopens the session from the handoff, then drops the account it replaced", async () => {
  await useSessionHandoff()({
    endpoint: "/api/auth/session-handoff",
    payload: { token: "handoff" },
  });
  expect(fetchCalls).toEqual([
    [
      "/auth/establish",
      {
        method: "POST",
        body: {
          endpoint: "/api/auth/session-handoff",
          payload: { token: "handoff" },
        },
      },
    ],
    [
      "/auth/remove-account",
      { method: "POST", body: { accountId: "account-before" } },
    ],
  ]);
  expect(refreshUser).toHaveBeenCalledOnce();
  expect(addCurrentAccount).toHaveBeenCalledOnce();
});

it("does nothing without a handoff", async () => {
  await useSessionHandoff()(undefined);
  expect(fetchCalls).toEqual([]);
  expect(refreshUser).not.toHaveBeenCalled();
});
