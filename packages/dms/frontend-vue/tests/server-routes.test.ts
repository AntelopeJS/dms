import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// The DMS serves its session, sign-in, provider sign-in and e-mail render
// routes from its own `dms.server.ts`: the renderer has none of its own
// since 0.6.0, so each request below reaches the DMS's routes alone.
import { readSealedCookie } from "@antelopejs/dms-frontend/templates/vue/server/auth/session.mjs";
import { serveModuleRoutes } from "@antelopejs/dms-frontend/templates/vue/server/module-testing.mjs";
import dmsServer from "../dms.server";

const RELAY_SECRET = "relay-secret-for-tests-only";
const RENDER_SECRET = "render-secret-for-tests-only";
const ESTABLISH_ENDPOINT = "/api/saas/register/finalize";
const UUID =
  /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/g;

interface BackendCall {
  method: string;
  path: string;
  body: unknown;
  authorization?: string;
  relay?: string;
  forwardedFor?: string;
}

function accessToken(tenantId: string, serial: string): string {
  const payload = Buffer.from(JSON.stringify({ tenantId, serial })).toString(
    "base64url",
  );
  return `header.${payload}.signature`;
}

const USER = {
  _id: "u1",
  email: "ada@example.test",
  name: "Ada",
  language: "fr",
};

/** What the backend answers each path with. */
function backendAnswer(path: string, body: Record<string, unknown>) {
  if (path === "/api/auth/login" && body.password === "wrong")
    return { status: 401, body: { message: "error.auth.invalid_credentials" } };
  if (path === "/api/auth/login" && body.email === "2fa@example.test")
    return {
      status: 200,
      body: {
        requires_2fa: true,
        two_factor_token: "challenge-1",
        methods: ["totp"],
      },
    };
  if (
    [
      "/api/auth/login",
      "/api/auth/signup",
      "/api/auth/verify-2fa",
      ESTABLISH_ENDPOINT,
      "/api/auth/oauth/github/callback",
    ].includes(path)
  )
    return {
      status: 200,
      body: {
        access_token: accessToken("t1", "login"),
        refresh_token: "refresh-1",
        user: USER,
      },
    };
  if (path === "/api/auth/refresh" && body.token === "revoked")
    return { status: 401, body: { message: "error.auth.invalid_token" } };
  if (path === "/api/auth/refresh" || path === "/api/auth/switch-tenant")
    return {
      status: 200,
      body: {
        access_token: accessToken("t2", path),
        refresh_token: "refresh-2",
      },
    };
  if (path === "/api/auth/me") return { status: 200, body: USER };
  if (path === "/api/auth/oauth/github/authorize-url")
    return {
      status: 200,
      body: {
        state: "state-1",
        authorizeUrl: "https://github.example/authorize",
      },
    };
  return { status: 200, body: { ok: true } };
}

const calls: BackendCall[] = [];

function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((settle) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      settle(text ? JSON.parse(text) : {});
    });
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((settle) => server.listen(0, "127.0.0.1", settle));
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("no address");
  return `http://127.0.0.1:${address.port}`;
}

function close(server: Server): Promise<void> {
  return new Promise((settle) => {
    server.closeAllConnections();
    server.close(() => settle());
  });
}

interface Answer {
  status: number;
  location: string | null;
  body: unknown;
  cookies: { name: string; attributes: string; value: unknown }[];
  calls: BackendCall[];
}

function normalized<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value ?? null)
      .replaceAll(UUID, "<account>")
      .replaceAll(/"updatedAt":\d+/g, '"updatedAt":"<stamp>"')
      .replaceAll(/"expiresAt":\d+/g, '"expiresAt":"<time>"'),
  );
}

/** A Set-Cookie header, its sealed value decoded. */
function decodedCookie(header: string) {
  const [pair, ...attributes] = header.split("; ");
  const separator = pair.indexOf("=");
  const scopedName = pair.slice(0, separator);
  const name = scopedName.replace(/_[0-9a-f]{12}$/, "");
  const raw = pair.slice(separator + 1);
  const value = raw
    ? readSealedCookie({ headers: { cookie: pair } }, name)
    : "";
  return { name: scopedName, attributes: attributes.join("; "), value };
}

async function ask(
  base: string,
  path: string,
  init: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: boolean;
    headers?: Record<string, string>;
  } = {},
): Promise<Answer> {
  calls.length = 0;
  const headers: Record<string, string> = { ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.origin !== false) headers.origin = base;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: "manual",
  });
  const text = await response.text();
  return normalized({
    status: response.status,
    location: response.headers.get("location"),
    body: text ? JSON.parse(text) : null,
    cookies: response.headers.getSetCookie().map(decodedCookie),
    calls: calls.map((call) => ({ ...call })),
  });
}

/** The cookies a browser keeps from an answer, as a Cookie header. */
async function cookiesOf(
  base: string,
  path: string,
  init: Parameters<typeof ask>[2],
): Promise<string> {
  const response = await fetch(`${base}${path}`, {
    method: init?.method ?? "POST",
    headers: {
      origin: base,
      "content-type": "application/json",
      ...(init?.cookie ? { cookie: init.cookie } : {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    redirect: "manual",
  });
  await response.arrayBuffer();
  return response.headers
    .getSetCookie()
    .map((header) => header.split(";", 1)[0])
    .filter((pair) => !pair.endsWith("="))
    .join("; ");
}

function renderToken(): string {
  const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString(
    "base64url",
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      namespace: "html-render-service",
      purpose: "html-render",
      aud: "dms-frontend",
      jti: randomUUID(),
      iat: now,
      exp: now + 300,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", RENDER_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

describe("the DMS's server routes", () => {
  const environment = { ...process.env };
  let backend: Server;
  let moduleRoutes: Awaited<ReturnType<typeof serveModuleRoutes>>;

  beforeAll(async () => {
    backend = createServer(async (request, response) => {
      const body = await readBody(request);
      const path = new URL(request.url ?? "/", "http://backend").pathname;
      calls.push({
        method: request.method ?? "",
        path,
        body,
        authorization: request.headers.authorization,
        relay: request.headers["x-dms-oauth-relay"] as string | undefined,
        forwardedFor: request.headers["x-forwarded-for"] as string | undefined,
      });
      const answer = backendAnswer(path, body);
      response.writeHead(answer.status, { "content-type": "application/json" });
      response.end(JSON.stringify(answer.body));
    });
    process.env.DMS_API_BASE_URL = await listen(backend);
    process.env.DMS_SESSION_SECRET =
      "a-test-only-session-secret-of-32-characters";
    process.env.DMS_COOKIE_SECURE = "false";
    process.env.DMS_OAUTH_RELAY_SECRET = RELAY_SECRET;
    process.env.DMS_HTML_RENDER_SECRET = RENDER_SECRET;
    process.env.DMS_AUTH_ESTABLISH_ENDPOINTS = ESTABLISH_ENDPOINT;
    moduleRoutes = await serveModuleRoutes([{ id: "dms", setup: dmsServer }], {
      privateOptions: {
        dms: {
          oauth: { relaySecret: RELAY_SECRET },
          htmlRender: { serviceSecret: RENDER_SECRET },
        },
      },
      authEstablishEndpoints: [ESTABLISH_ENDPOINT],
    });
  });

  afterAll(async () => {
    await moduleRoutes.close();
    await close(backend);
    process.env = environment;
  });

  /** Asks the DMS's routes. */
  async function askDms(
    path: string,
    init:
      | Parameters<typeof ask>[2]
      | ((base: string) => Promise<Parameters<typeof ask>[2]>) = {},
  ): Promise<Answer> {
    const options =
      typeof init === "function" ? await init(moduleRoutes.url) : init;
    return ask(moduleRoutes.url, path, options);
  }

  it("declares every route and hook with no warning", () => {
    expect(moduleRoutes.warnings).toEqual([]);
  });

  it("proxies the backend's /api and /dms prefixes with the session, and nothing else", () => {
    const proxies = moduleRoutes.modules.proxies.map(
      (proxy: { path: string; auth: string; owner: string }) => ({
        path: proxy.path,
        auth: proxy.auth,
      }),
    );
    expect(proxies).toEqual(
      expect.arrayContaining([
        { path: "/api/**", auth: "session" },
        { path: "/dms/**", auth: "session" },
      ]),
    );
    expect(proxies).toHaveLength(2);
  });

  it("signs in for the browser session only, unless asked to keep it", async () => {
    const browserOnly = await askDms("/auth/login", {
      body: { email: "ada@example.test", password: "secret" },
    });
    expect(browserOnly.status).toBe(200);
    expect(browserOnly.cookies.map((cookie) => cookie.attributes)).toEqual([
      "Path=/; HttpOnly; SameSite=Lax",
      "Path=/; HttpOnly; SameSite=Lax",
      "Path=/; HttpOnly; SameSite=Lax",
    ]);
    const kept = await askDms("/auth/login", {
      body: { email: "ada@example.test", password: "secret", keep_login: true },
    });
    expect(
      kept.cookies.every((cookie) =>
        cookie.attributes.endsWith("Max-Age=2592000"),
      ),
    ).toBe(true);
    expect(kept.calls[0].forwardedFor).toBe("127.0.0.1");
  });

  it("refuses bad credentials with the backend's message, and a login from another site", async () => {
    const refused = await askDms("/auth/login", {
      body: { email: "ada@example.test", password: "wrong" },
    });
    expect(refused.status).toBe(401);
    expect(refused.body).toEqual({ message: "error.auth.invalid_credentials" });
    const crossSite = await askDms("/auth/login", {
      origin: false,
      body: { email: "ada@example.test", password: "secret" },
    });
    expect(crossSite.status).toBe(403);
    expect(crossSite.calls).toEqual([]);
  });

  it("carries the keep-me-signed-in choice across the 2FA step", async () => {
    const challenge = await askDms("/auth/login", {
      body: { email: "2fa@example.test", password: "secret", keep_login: true },
    });
    expect(challenge.cookies[0].attributes).toBe(
      "Path=/auth/verify-2fa; HttpOnly; SameSite=Lax; Max-Age=300",
    );
    const verified = await askDms("/auth/verify-2fa", async (base) => ({
      cookie: await cookiesOf(base, "/auth/login", {
        body: {
          email: "2fa@example.test",
          password: "secret",
          keep_login: true,
        },
      }),
      body: { token: "challenge-1", code: "123456" },
    }));
    expect(verified.status).toBe(200);
    expect(
      verified.cookies.some((cookie) =>
        cookie.attributes.endsWith("Max-Age=2592000"),
      ),
    ).toBe(true);
  });

  it("serves, renews and ends the session on /api/_auth/session", async () => {
    const signedIn = (base: string) =>
      cookiesOf(base, "/auth/login", {
        body: {
          email: "ada@example.test",
          password: "secret",
          keep_login: true,
        },
      });
    const read = await askDms("/api/_auth/session", async (base) => ({
      method: "GET",
      origin: false,
      cookie: await signedIn(base),
    }));
    expect(read.body).toMatchObject({
      user: USER,
      session: { activeTenantId: "t1" },
    });
    const renewed = await askDms("/api/_auth/session", async (base) => ({
      cookie: await signedIn(base),
    }));
    expect(renewed.body).toMatchObject({ session: { activeTenantId: "t2" } });
    const ended = await askDms("/api/_auth/session", async (base) => ({
      method: "DELETE",
      cookie: await signedIn(base),
    }));
    expect(ended.calls.map((call) => call.path)).toEqual(["/api/auth/logout"]);
    const other = await askDms("/api/_auth/session", {
      method: "PUT",
      origin: false,
    });
    expect(other.status).toBe(405);
  });

  it("switches and validates stored accounts, and forgets one", async () => {
    const twoAccounts = async (base: string) => {
      const first = await cookiesOf(base, "/auth/login", {
        body: {
          email: "ada@example.test",
          password: "secret",
          keep_login: true,
        },
      });
      return cookiesOf(base, "/auth/login", {
        cookie: first,
        body: {
          email: "ada@example.test",
          password: "secret",
          keep_login: true,
        },
      }).then((second) => `${first}; ${second}`);
    };
    const accountOf = (cookie: string) =>
      cookie
        .match(/dms_account_([0-9a-f]{32})_/)?.[1]
        ?.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
    for (const action of [
      "switch-account",
      "validate-account",
      "remove-account",
    ]) {
      const answer = await askDms(`/auth/${action}`, async (base) => {
        const cookie = await twoAccounts(base);
        return { cookie, body: { accountId: accountOf(cookie) } };
      });
      expect(answer.status).toBe(200);
    }
    const expired = await askDms("/auth/switch-account", {
      body: { accountId: randomUUID() },
    });
    expect(expired.status).toBe(401);
  });

  it("switches tenant, opens a declared session and relays the 2FA e-mail", async () => {
    const tenant = await askDms("/auth/switch-tenant", async (base) => ({
      cookie: await cookiesOf(base, "/auth/login", {
        body: { email: "ada@example.test", password: "secret" },
      }),
      body: { tenantId: "t2" },
    }));
    expect(tenant.body).toMatchObject({ success: true });
    expect(
      (await askDms("/auth/switch-tenant", { body: { tenantId: "t2" } }))
        .status,
    ).toBe(401);
    const established = await askDms("/auth/establish", {
      body: { endpoint: ESTABLISH_ENDPOINT, payload: { token: "x" } },
    });
    expect(established.status).toBe(200);
    const refused = await askDms("/auth/establish", {
      body: { endpoint: "/api/auth/login", payload: {} },
    });
    expect(refused.status).toBe(403);
    expect(refused.calls).toEqual([]);
    const relayed = await askDms("/auth/request-2fa-email", {
      body: { token: "challenge-1" },
    });
    expect(relayed.calls.map((call) => call.path)).toEqual([
      "/api/auth/request-2fa-email",
    ]);
  });

  it("runs a provider sign-in: start, callback, handoff", async () => {
    const start = await askDms(
      "/auth/oauth/github/start?redirect=%2Fprojects",
      {
        method: "GET",
        origin: false,
      },
    );
    expect(start.status).toBe(302);
    expect(start.location).toBe("https://github.example/authorize");
    expect(start.calls[0].relay).toBe(RELAY_SECRET);
    expect(start.cookies[0].attributes).toBe(
      "Path=/auth/oauth; HttpOnly; SameSite=Lax; Max-Age=600",
    );
    const flow = (base: string) =>
      fetch(`${base}/auth/oauth/github/start?redirect=%2Fprojects`, {
        redirect: "manual",
      }).then(
        (response) => response.headers.getSetCookie()[0].split(";", 1)[0],
      );
    const callback = await askDms(
      "/auth/oauth/github/callback?code=c&state=state-1",
      async (base) => ({
        method: "GET",
        origin: false,
        cookie: await flow(base),
      }),
    );
    expect(callback.location).toBe("/auth/oauth/complete?redirect=%2Fprojects");
    expect(callback.calls[0].relay).toBe(RELAY_SECRET);
    const forged = await askDms(
      "/auth/oauth/github/callback?code=c&state=other",
      async (base) => ({
        method: "GET",
        origin: false,
        cookie: await flow(base),
      }),
    );
    expect(forged.location).toBe("/auth?oauth_error=error.oauth.invalid_state");
    const cancelled = await askDms(
      "/auth/oauth/github/callback?error=access_denied",
      {
        method: "GET",
        origin: false,
      },
    );
    expect(cancelled.location).toBe("/auth?oauth_error=error.oauth.cancelled");
    const handoff = await askDms("/auth/oauth/handoff", {});
    expect(handoff.body).toEqual({ kind: "none" });
  });

  it("renders e-mails for the backend's service token only", async () => {
    const refused = await askDms("/api/html/render", {
      origin: false,
      body: { templateName: "EmailLayout", props: {} },
    });
    expect(refused.status).toBe(401);
    expect(refused.body).toEqual({ message: "Invalid service token" });
    // No e-mail bundle is built here: the render fails once the token passes.
    const missing = await askDms("/api/html/render", () =>
      Promise.resolve({
        origin: false,
        headers: { "x-dms-service-token": renderToken() },
        body: { templateName: "EmailLayout", props: {} },
      }),
    );
    expect(missing.status).toBe(404);
  });

  it("prefers the manifest's secrets to the environment's", async () => {
    const environmentSecrets = {
      render: process.env.DMS_HTML_RENDER_SECRET,
      relay: process.env.DMS_OAUTH_RELAY_SECRET,
    };
    process.env.DMS_HTML_RENDER_SECRET = "a-stale-render-secret";
    process.env.DMS_OAUTH_RELAY_SECRET = "a-stale-relay-secret";
    try {
      const accepted = await askDms("/api/html/render", {
        origin: false,
        headers: { "x-dms-service-token": renderToken() },
        body: { templateName: "EmailLayout", props: {} },
      });
      // Accepted: the render itself fails, no e-mail bundle is built here.
      expect(accepted.status).toBe(404);
      const start = await askDms("/auth/oauth/github/start", {
        method: "GET",
        origin: false,
      });
      expect(start.calls[0].relay).toBe(RELAY_SECRET);
    } finally {
      process.env.DMS_HTML_RENDER_SECRET = environmentSecrets.render;
      process.env.DMS_OAUTH_RELAY_SECRET = environmentSecrets.relay;
    }
  });

  it("takes the secrets from the environment when the manifest withheld the private options", async () => {
    const withheld = await serveModuleRoutes([{ id: "dms", setup: dmsServer }]);
    try {
      const response = await fetch(`${withheld.url}/api/html/render`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dms-service-token": renderToken(),
        },
        body: JSON.stringify({ templateName: "EmailLayout", props: {} }),
      });
      // Accepted: the render itself fails, no e-mail bundle is built here.
      expect(response.status).toBe(404);
      calls.length = 0;
      await fetch(`${withheld.url}/auth/oauth/github/start`, {
        redirect: "manual",
      });
      expect(calls[0].relay).toBe(RELAY_SECRET);
    } finally {
      await withheld.close();
    }
  });
});
