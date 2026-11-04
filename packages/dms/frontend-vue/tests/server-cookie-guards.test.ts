import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { isObject } from "../layers/dms-core/app/utils/type-check";
import { spoiledShapes } from "./helpers/cookie-shapes";
import { createServerRoutesFixture } from "./helpers/server-routes-fixture";
import { sealedCookie } from "./helpers/server-routes-fixtures";

const DESCRIPTOR = {
  accountId: "other",
  userId: "u1",
  email: "ada@example.test",
  name: "Ada",
  activeTenantId: "t1",
  persistent: true,
};
const DESCRIPTOR_WRONG = {
  accountId: [5],
  userId: [5],
  email: [5],
  name: [5],
  activeTenantId: [5],
  persistent: ["yes", 1],
};

describe("the sealed cookies the DMS's server routes read", () => {
  const fixture = createServerRoutesFixture();
  let clients = 0;

  beforeAll(() => {
    process.env.DMS_CLIENT_IP_HEADER = "x-client-ip";
  });

  it("keeps an account index whose every entry has a descriptor's shape, and forgets any other", async () => {
    const indexAfterLogin = async (index: unknown) => {
      const answer = await fixture.askDms("/auth/login", {
        cookie: sealedCookie("dms_account_index", index),
        body: { email: "ada@example.test", password: "secret" },
      });
      const stored = answer.cookies.find((cookie) =>
        cookie.name.startsWith("dms_account_index_"),
      );
      return isObject(stored?.value) ? Object.keys(stored.value) : [];
    };
    expect(await indexAfterLogin({ other: DESCRIPTOR })).toEqual([
      "other",
      "<account>",
    ]);
    expect(
      await indexAfterLogin({
        other: { accountId: "other", persistent: false },
      }),
    ).toEqual(["other", "<account>"]);
    const refused = [
      ...spoiledShapes(DESCRIPTOR, DESCRIPTOR_WRONG, [
        "accountId",
        "persistent",
      ]).map((descriptor) => ({ other: descriptor })),
      [DESCRIPTOR],
      ...spoiledShapes(DESCRIPTOR, {}, []),
    ];
    for (const index of refused)
      expect(await indexAfterLogin(index), JSON.stringify(index)).toEqual([
        "<account>",
      ]);
  });

  it("switches to a stored account of a descriptor's shape and a refresh token, and to no other", async () => {
    const accountId = randomUUID();
    const name = `dms_account_${accountId.replaceAll("-", "")}`;
    const switchTo = (account: unknown) =>
      fixture.askDms("/auth/switch-account", {
        cookie: sealedCookie(name, account),
        body: { accountId },
      });
    const stored = { ...DESCRIPTOR, accountId, refreshToken: "refresh-1" };
    expect((await switchTo(stored)).status).toBe(200);
    expect((await switchTo({ accountId, persistent: false })).status).toBe(200);
    for (const account of spoiledShapes(
      stored,
      { ...DESCRIPTOR_WRONG, accountId: [5], refreshToken: [5] },
      ["accountId", "persistent"],
    )) {
      const refused = await switchTo(account);
      expect(refused.status, JSON.stringify(account)).toBe(401);
      expect(refused.calls).toEqual([]);
    }
  });

  it("keeps the browser-only choice of a pending login cookie of the right shape, and the default for any other", async () => {
    const pending = { token: "challenge-1", persistent: false };
    const verify = (cookie: unknown, token: unknown) =>
      fixture.askDms("/auth/verify-2fa", {
        cookie: sealedCookie("dms_pending_login", cookie),
        body: { token, code: "123456" },
      });
    const outlives = (answer: Awaited<ReturnType<typeof verify>>) =>
      answer.cookies.some((cookie) =>
        cookie.attributes.endsWith("Max-Age=2592000"),
      );
    const browserOnly = await verify(pending, "challenge-1");
    expect(browserOnly.status).toBe(200);
    expect(outlives(browserOnly)).toBe(false);
    for (const cookie of spoiledShapes(
      pending,
      { token: [5], persistent: ["yes", 0] },
      ["token", "persistent"],
    )) {
      const answer = await verify(
        cookie,
        isObject(cookie) && cookie !== null ? cookie.token : "challenge-1",
      );
      expect(answer.status, JSON.stringify(cookie)).toBe(200);
      expect(outlives(answer), JSON.stringify(cookie)).toBe(true);
    }
  });

  it("clears a pending login cookie of the right shape when a login ends", async () => {
    const answer = await fixture.askDms("/auth/login", {
      cookie: sealedCookie("dms_pending_login", {
        token: "challenge-1",
        persistent: false,
      }),
      body: { email: "ada@example.test", password: "secret" },
    });
    expect(
      answer.cookies.some(
        (set) =>
          set.name.startsWith("dms_pending_login") &&
          set.attributes.endsWith("Max-Age=0"),
      ),
    ).toBe(true);
  });

  it("runs the callback of an OAuth flow of the right shape, and refuses any other", async () => {
    const callbackWith = (flow: unknown) => {
      clients += 1;
      return fixture.askDms(
        "/auth/oauth/github/callback?code=c&state=state-1",
        {
          method: "GET",
          origin: false,
          cookie: sealedCookie("dms_oauth_flow", flow),
          headers: { "x-client-ip": `10.0.0.${clients}` },
        },
      );
    };
    const flow = {
      state: "state-1",
      expiresAt: Date.now() + 60_000,
      redirect: "/projects",
      language: "",
      invite: "",
    };
    expect((await callbackWith(flow)).location).toBe(
      "/auth/oauth/complete?redirect=%2Fprojects",
    );
    for (const spoiled of spoiledShapes(
      flow,
      {
        state: [5],
        expiresAt: ["soon", String(Date.now() + 60_000)],
        redirect: [5],
        language: [5],
        invite: [5],
      },
      ["state", "expiresAt", "redirect", "language", "invite"],
    )) {
      const answer = await callbackWith(spoiled);
      expect(answer.location, JSON.stringify(spoiled)).toBe(
        "/auth?oauth_error=error.oauth.invalid_state",
      );
      expect(answer.calls).toEqual([]);
    }
  });

  it("hands over an OAuth handoff of either step's shape, and none for any other", async () => {
    const handoffOf = (value: unknown) =>
      fixture.askDms("/auth/oauth/handoff", {
        cookie: sealedCookie("dms_oauth_handoff", value),
      });
    const twoFactor = { kind: "2fa", token: "challenge-1", methods: ["totp"] };
    const noWorkspace = {
      kind: "no-workspace",
      token: "assignment-1",
      provider: "github",
    };
    for (const handoff of [twoFactor, noWorkspace])
      expect((await handoffOf(handoff)).body).toEqual(handoff);
    const refused = [
      ...spoiledShapes(
        twoFactor,
        { kind: ["other", "none", 5], token: [5], methods: ["totp", [5], {}] },
        ["token", "methods"],
      ),
      ...spoiledShapes(
        noWorkspace,
        { kind: ["other", "none", 5], token: [5], provider: [5] },
        ["token", "provider"],
      ),
      { kind: "2fa" },
      { kind: "no-workspace" },
    ];
    for (const handoff of refused)
      expect((await handoffOf(handoff)).body, JSON.stringify(handoff)).toEqual({
        kind: "none",
      });
  });
});
