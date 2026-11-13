import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { isFunction } from "../layers/dms-core/app/utils/type-check";
import { spoiledShapes } from "./helpers/cookie-shapes";
import { createServerRoutesFixture } from "./helpers/server-routes-fixture";
import {
  type ask,
  ESTABLISH_ENDPOINT,
  USER,
  answerOverrides,
  cookiesOf,
  renderToken,
  sealedCookie,
} from "./helpers/server-routes-fixtures";

interface Reply {
  status: number;
  body: unknown;
}

type AskInit = Parameters<typeof ask>[2];
type Answer = Awaited<ReturnType<typeof ask>>;

const ok = (body: unknown): Reply => ({ status: 200, body });
const FAILED: Reply = {
  status: 502,
  body: { message: "error.500.description" },
};

const ACCESS_TOKEN = `header.${Buffer.from('{"tenantId":"t1"}').toString("base64url")}.signature`;
const PAIR = { access_token: ACCESS_TOKEN, refresh_token: "refresh-1" };
const TOKENS = { ...PAIR, user: USER };
const CHALLENGE = {
  requires_2fa: true,
  two_factor_token: "challenge-1",
  methods: ["totp"],
};
const ASSIGNMENT = {
  requires_tenant_assignment: true,
  tenant_assignment_token: "assignment-1",
  user: USER,
};
const SIGN_IN = { email: "ada@example.test", password: "secret" };

const NOT_RECORDS = spoiledShapes({}, {}, []);
const SPOILED_USERS = spoiledShapes(USER, { language: [5, null] }, []);
const SPOILED_PAIRS = spoiledShapes(
  PAIR,
  { access_token: [5], refresh_token: [5] },
  ["access_token"],
);
const SPOILED_OUTCOMES = [
  ...spoiledShapes(
    TOKENS,
    { access_token: [5], refresh_token: [5], user: SPOILED_USERS },
    ["access_token"],
  ),
  ...spoiledShapes(
    CHALLENGE,
    { requires_2fa: ["yes"], two_factor_token: [5], methods: ["totp", [5]] },
    ["two_factor_token", "methods"],
  ),
  ...spoiledShapes(
    ASSIGNMENT,
    { requires_tenant_assignment: ["yes"], tenant_assignment_token: [5] },
    ["tenant_assignment_token"],
  ),
];

const SIGN_IN_ROUTES = [
  { route: "/auth/login", backend: "/api/auth/login", body: SIGN_IN },
  { route: "/auth/register", backend: "/api/auth/signup", body: SIGN_IN },
  {
    route: "/auth/verify-2fa",
    backend: "/api/auth/verify-2fa",
    body: { token: "challenge-1", code: "123456" },
  },
  {
    route: "/auth/establish",
    backend: ESTABLISH_ENDPOINT,
    body: { endpoint: ESTABLISH_ENDPOINT, payload: {} },
  },
];

const BODY_ROUTES = [
  "/auth/login",
  "/auth/verify-2fa",
  "/auth/establish",
  "/auth/remove-account",
  "/auth/switch-tenant",
  "/auth/switch-account",
  "/auth/validate-account",
];

/** What a provider sign-in shows the browser; its backend calls carry each test client's address. */
function seen(answer: Answer) {
  return { ...answer, calls: answer.calls.map((call) => call.path) };
}

describe("the backend answers and request bodies the DMS's server routes read", () => {
  const fixture = createServerRoutesFixture();
  let clients = 0;

  beforeAll(() => {
    process.env.DMS_CLIENT_IP_HEADER = "x-client-ip";
  });

  afterEach(() => answerOverrides.clear());

  /** Asks `route` while the backend answers each of `replies`' paths with its reply. */
  function askReplying(
    route: string,
    replies: Record<string, Reply>,
    init: AskInit | ((base: string) => Promise<AskInit>) = {},
  ): Promise<Answer> {
    return fixture.askDms(route, async (base) => {
      const options = isFunction(init) ? await init(base) : init;
      answerOverrides.clear();
      for (const [path, reply] of Object.entries(replies))
        answerOverrides.set(path, reply);
      return options;
    });
  }

  /** The cookies of a session whose refresh token no other test spends. */
  async function signedIn(base: string): Promise<string> {
    answerOverrides.set(
      "/api/auth/login",
      ok({ ...TOKENS, refresh_token: randomUUID() }),
    );
    try {
      return await cookiesOf(base, "/auth/login", {
        body: { ...SIGN_IN, keep_login: true },
      });
    } finally {
      answerOverrides.delete("/api/auth/login");
    }
  }

  function providerRequest(): AskInit {
    clients += 1;
    return {
      method: "GET",
      origin: false,
      headers: {
        "x-client-ip": `10.1.${Math.floor(clients / 200)}.${clients % 200}`,
      },
      cookie: sealedCookie("dms_oauth_flow", {
        state: "state-1",
        expiresAt: Date.now() + 60_000,
        redirect: "/projects",
        language: "",
        invite: "",
      }),
    };
  }

  it("opens no session from a sign-in answer of another shape, and answers it as a failed backend", async () => {
    for (const { route, backend, body } of SIGN_IN_ROUTES) {
      const signIn = (reply: Reply) =>
        askReplying(route, { [backend]: reply }, { body });
      const failed = await signIn(FAILED);
      expect(failed.status).toBe(502);
      for (const answer of SPOILED_OUTCOMES)
        expect(
          await signIn(ok(answer)),
          `${route} ${JSON.stringify(answer)}`,
        ).toEqual(failed);
    }
  });

  it("hands the browser a sign-in step whole, as the backend answered it", async () => {
    for (const step of [CHALLENGE, ASSIGNMENT]) {
      const answer = await askReplying(
        "/auth/login",
        { "/api/auth/login": ok(step) },
        { body: SIGN_IN },
      );
      expect(answer.status).toBe(200);
      expect(answer.body).toEqual(step);
    }
  });

  it("ends a provider sign-in on an answer of another shape as on a failed backend, and hands over each step", async () => {
    const callback = async (reply: Reply) =>
      seen(
        await askReplying(
          "/auth/oauth/github/callback?code=c&state=state-1",
          { "/api/auth/oauth/github/callback": reply },
          providerRequest(),
        ),
      );
    const failed = await callback(FAILED);
    expect(failed.location).toBe("/auth?oauth_error=error.oauth.failed");
    for (const answer of SPOILED_OUTCOMES)
      expect(await callback(ok(answer)), JSON.stringify(answer)).toEqual(
        failed,
      );
    const handoffOf = async (step: unknown) => {
      const answer = await callback(ok(step));
      expect(answer.location).toBe("/auth/oauth/complete");
      return answer.cookies.find((cookie) =>
        cookie.name.startsWith("dms_oauth_handoff"),
      )?.value;
    };
    expect(await handoffOf(CHALLENGE)).toEqual({
      kind: "2fa",
      token: "challenge-1",
      methods: ["totp"],
    });
    expect(await handoffOf(ASSIGNMENT)).toEqual({
      kind: "no-workspace",
      token: "assignment-1",
      provider: "github",
    });
  });

  it("starts no provider sign-in from an authorize-url answer of another shape", async () => {
    const start = async (reply: Reply) =>
      seen(
        await askReplying(
          "/auth/oauth/github/start",
          { "/api/auth/oauth/github/authorize-url": reply },
          providerRequest(),
        ),
      );
    const failed = await start(FAILED);
    expect(failed.location).toBe("/auth?oauth_error=error.oauth.failed");
    for (const answer of spoiledShapes(
      { state: "state-1", authorizeUrl: "https://github.example/authorize" },
      { state: [5], authorizeUrl: [5] },
      ["state", "authorizeUrl"],
    ))
      expect(await start(ok(answer)), JSON.stringify(answer)).toEqual(failed);
  });

  it("renews no session from a refresh or user answer of another shape, and keeps it as on a failed backend", async () => {
    const renew = (replies: Record<string, Reply>) =>
      askReplying("/api/_auth/session", replies, async (base) => ({
        cookie: await signedIn(base),
      }));
    const refreshFailed = await renew({ "/api/auth/refresh": FAILED });
    for (const pair of SPOILED_PAIRS)
      expect(
        await renew({ "/api/auth/refresh": ok(pair) }),
        JSON.stringify(pair),
      ).toEqual(refreshFailed);
    const userFailed = await renew({ "/api/auth/me": FAILED });
    for (const user of SPOILED_USERS)
      expect(
        await renew({ "/api/auth/me": ok(user) }),
        JSON.stringify(user),
      ).toEqual(userFailed);
  });

  it("switches no tenant on a switch-tenant or user answer of another shape, and answers it as a failed backend", async () => {
    const switchTenant = (replies: Record<string, Reply>) =>
      askReplying("/auth/switch-tenant", replies, async (base) => ({
        cookie: await signedIn(base),
        body: { tenantId: "t2" },
      }));
    const switchFailed = await switchTenant({
      "/api/auth/switch-tenant": FAILED,
    });
    expect(switchFailed.status).toBe(502);
    for (const pair of SPOILED_PAIRS)
      expect(
        await switchTenant({ "/api/auth/switch-tenant": ok(pair) }),
        JSON.stringify(pair),
      ).toEqual(switchFailed);
    const userFailed = await switchTenant({ "/api/auth/me": FAILED });
    for (const user of SPOILED_USERS)
      expect(
        await switchTenant({ "/api/auth/me": ok(user) }),
        JSON.stringify(user),
      ).toEqual(userFailed);
  });

  it("keeps a stored account it cannot refresh from an answer of another shape, as on a failed backend", async () => {
    const accountId = randomUUID();
    const cookie = sealedCookie(
      `dms_account_${accountId.replaceAll("-", "")}`,
      { accountId, persistent: true, refreshToken: "refresh-1" },
    );
    const askAccount = (route: string, replies: Record<string, Reply>) =>
      askReplying(route, replies, { cookie, body: { accountId } });
    for (const route of ["/auth/switch-account", "/auth/validate-account"]) {
      const failed = await askAccount(route, { "/api/auth/refresh": FAILED });
      for (const pair of SPOILED_PAIRS)
        expect(
          await askAccount(route, { "/api/auth/refresh": ok(pair) }),
          `${route} ${JSON.stringify(pair)}`,
        ).toEqual(failed);
    }
    const validated = await askAccount("/auth/validate-account", {
      "/api/auth/refresh": ok(SPOILED_PAIRS[0]),
    });
    expect(validated.body).toEqual({ valid: null });
    const userFailed = await askAccount("/auth/switch-account", {
      "/api/auth/me": FAILED,
    });
    for (const user of SPOILED_USERS)
      expect(
        await askAccount("/auth/switch-account", { "/api/auth/me": ok(user) }),
        JSON.stringify(user),
      ).toEqual(userFailed);
  });

  it("refuses a JSON body that is no object as one that is no JSON, before it calls the backend", async () => {
    const base = fixture.moduleRoutes.url;
    for (const route of BODY_ROUTES) {
      const response = await fetch(`${base}${route}`, {
        method: "POST",
        headers: { origin: base, "content-type": "application/json" },
        body: "{",
      });
      const notJson = { status: response.status, body: await response.json() };
      expect(notJson.status).toBe(400);
      for (const body of NOT_RECORDS) {
        const answer = await fixture.askDms(route, { body });
        expect(
          { status: answer.status, body: answer.body },
          `${route} ${JSON.stringify(body)}`,
        ).toEqual(notJson);
        expect(answer.calls).toEqual([]);
      }
    }
  });

  it("refuses a render body that is no object as one whose template name is no string", async () => {
    const render = (body: unknown) =>
      fixture.askDms("/api/html/render", {
        origin: false,
        headers: { "x-dms-service-token": renderToken() },
        body,
      });
    const refused = await render({ templateName: 5, props: {} });
    expect(refused.status).toBe(400);
    for (const body of NOT_RECORDS)
      expect(await render(body), JSON.stringify(body)).toEqual(refused);
  });
});
