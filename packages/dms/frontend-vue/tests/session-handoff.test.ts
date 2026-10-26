/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import { useSessionHandoff } from "../layers/dms-layout/app/build/composables/security/useSessionHandoff";
import { useMultiAccount } from "../layers/dms-core/app/composables/auth/useMultiAccount";
import { installAuthSettingsRuntime } from "./helpers/auth-settings-runtime";
import { browserRuntime } from "./helpers/api-data-runtime";
import type { useAuthFetch } from "../layers/dms-core/app/composables/auth/useAuthFetch";

const session = ref({ accountId: "account-before" });
const user = ref({ _id: "user", email: "member@example.test", name: "Member" });
const refreshUser = vi.fn(async () => {
  session.value = { accountId: "account-after" };
});
const fetchCalls: Array<[string, unknown]> = [];

beforeEach(() => {
  installAuthSettingsRuntime();
  browserRuntime();
  localStorage.clear();
  fetchCalls.length = 0;
  refreshUser.mockClear();
  session.value = { accountId: "account-before" };
  vi.stubGlobal(
    "$fetch",
    async (
      url: string,
      options: Parameters<ReturnType<typeof useAuthFetch>["$authFetch"]>[1],
    ) => {
      fetchCalls.push([url, options]);
      return {};
    },
  );
  vi.stubGlobal("useDmsUserSession", () => ({
    session,
    user,
    fetch: refreshUser,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("reopens the session from the handoff, then drops the account it replaced", async () => {
  useMultiAccount().addCurrentAccount();
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
  await nextTick();
  expect(useMultiAccount().accounts.value).toEqual([
    expect.objectContaining({ userId: "user", accountId: "account-after" }),
  ]);
  expect(JSON.parse(localStorage.getItem("antelopejs-accounts")!)).toEqual([
    expect.objectContaining({
      email: "member@example.test",
      accountId: "account-after",
    }),
  ]);
});

it("does nothing without a handoff", async () => {
  await useSessionHandoff()(undefined);
  expect(fetchCalls).toEqual([]);
  expect(refreshUser).not.toHaveBeenCalled();
});
