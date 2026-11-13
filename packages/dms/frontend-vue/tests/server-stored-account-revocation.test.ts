import { describe, expect, it } from "vitest";
import { createServerRoutesFixture } from "./helpers/server-routes-fixture";
import {
  EXPIRED_EMAIL,
  REVOKED_EMAIL,
  cookiesOf,
} from "./helpers/server-routes-fixtures";

type Answer = Awaited<
  ReturnType<ReturnType<typeof createServerRoutesFixture>["askDms"]>
>;

function storedAccounts(answer: Answer) {
  const cookie = (prefix: string) =>
    answer.cookies.find((set) => set.name.startsWith(prefix));
  const account = cookie("dms_account_<account>_");
  return {
    accountCleared:
      account?.value === "" && account.attributes.endsWith("Max-Age=0"),
    index: cookie("dms_account_index_")?.value,
  };
}

const FORGOTTEN = { accountCleared: true, index: {} };

describe("a stored account whose session the backend revoked", () => {
  const fixture = createServerRoutesFixture();
  const signedIn = (base: string) =>
    cookiesOf(base, "/auth/login", {
      body: { email: REVOKED_EMAIL, password: "secret", keep_login: true },
    });

  it("is forgotten with the session when its renewal is refused", async () => {
    const renewal = await fixture.askDms(
      "/api/_auth/session",
      async (base) => ({
        cookie: await signedIn(base),
      }),
    );
    expect(renewal.calls.map((call) => call.path)).toEqual([
      "/api/auth/refresh",
    ]);
    expect(renewal.body).toEqual({});
    expect(storedAccounts(renewal)).toEqual(FORGOTTEN);
  });

  it("is refused and forgotten when switched to or validated", async () => {
    const accountOf = (cookie: string) =>
      cookie
        .match(/dms_account_([0-9a-f]{32})_/)?.[1]
        ?.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
    const use = (action: string) =>
      fixture.askDms(`/auth/${action}`, async (base) => {
        const cookie = await signedIn(base);
        return { cookie, body: { accountId: accountOf(cookie) } };
      });
    const switched = await use("switch-account");
    expect(switched.status).toBe(401);
    expect(storedAccounts(switched)).toEqual(FORGOTTEN);
    const validated = await use("validate-account");
    expect(validated.body).toEqual({ valid: false });
    expect(storedAccounts(validated)).toEqual(FORGOTTEN);
  });
});

describe("a sign-out with an expired access token", () => {
  const fixture = createServerRoutesFixture();

  it("renews it and revokes the backend session all the same", async () => {
    const ended = await fixture.askDms("/api/_auth/session", async (base) => ({
      method: "DELETE",
      cookie: await cookiesOf(base, "/auth/login", {
        body: { email: EXPIRED_EMAIL, password: "secret" },
      }),
    }));
    expect(ended.calls.map((call) => call.path)).toEqual([
      "/api/auth/logout",
      "/api/auth/refresh",
      "/api/auth/logout",
    ]);
    expect(ended.calls[2].authorization).not.toBe(ended.calls[0].authorization);
    expect(storedAccounts(ended)).toEqual(FORGOTTEN);
  });
});
