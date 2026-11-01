import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { serveModuleRoutes } from "@antelopejs/dms-frontend/templates/vue/server/module-testing.mjs";
import dmsServer from "../dms.server";
import { createServerRoutesFixture } from "./helpers/server-routes-fixture";
import {
  RELAY_SECRET,
  ESTABLISH_ENDPOINT,
  USER,
  calls,
  cookiesOf,
  renderToken,
} from "./helpers/server-routes-fixtures";
describe("the DMS's server routes", () => {
  const fixture = createServerRoutesFixture();
  registerRouteDeclarationAndLoginTests(fixture);
  registerSessionLifetimeTests(fixture);
  registerAccountRouteTests(fixture);
  registerServiceRouteTests(fixture);
  registerServerSecretTests(fixture);
});

function registerRouteDeclarationAndLoginTests(
  fixture: ReturnType<typeof createServerRoutesFixture>,
) {
  it("declares every route and hook with no warning", () => {
    expect(fixture.moduleRoutes.warnings).toEqual([]);
  });

  it("proxies /api and /dms with the session, the storage's signed URLs without, and nothing else", () => {
    const proxies = fixture.moduleRoutes.modules.proxies.map(
      (proxy: { path: string; auth: string; owner: string }) => ({
        path: proxy.path,
        auth: proxy.auth,
      }),
    );
    expect(proxies).toEqual(
      expect.arrayContaining([
        { path: "/api/**", auth: "session" },
        { path: "/dms/**", auth: "session" },
        { path: "/file-storage/upload/**", auth: "none" },
        { path: "/file-storage/files/**", auth: "none" },
      ]),
    );
    expect(proxies).toHaveLength(4);
  });

  it("signs in for the browser session only, unless asked to keep it", async () => {
    const browserOnly = await fixture.askDms("/auth/login", {
      body: { email: "ada@example.test", password: "secret" },
    });
    expect(browserOnly.status).toBe(200);
    expect(browserOnly.cookies.map((cookie) => cookie.attributes)).toEqual([
      "Path=/; HttpOnly; SameSite=Lax",
      "Path=/; HttpOnly; SameSite=Lax",
      "Path=/; HttpOnly; SameSite=Lax",
    ]);
    const kept = await fixture.askDms("/auth/login", {
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
    const refused = await fixture.askDms("/auth/login", {
      body: { email: "ada@example.test", password: "wrong" },
    });
    expect(refused.status).toBe(401);
    expect(refused.body).toEqual({ message: "error.auth.invalid_credentials" });
    const crossSite = await fixture.askDms("/auth/login", {
      origin: false,
      body: { email: "ada@example.test", password: "secret" },
    });
    expect(crossSite.status).toBe(403);
    expect(crossSite.calls).toEqual([]);
  });
}

function registerSessionLifetimeTests(
  fixture: ReturnType<typeof createServerRoutesFixture>,
) {
  it("carries the keep-me-signed-in choice across the 2FA step", async () => {
    const challenge = await fixture.askDms("/auth/login", {
      body: { email: "2fa@example.test", password: "secret", keep_login: true },
    });
    expect(challenge.cookies[0].attributes).toBe(
      "Path=/auth/verify-2fa; HttpOnly; SameSite=Lax; Max-Age=300",
    );
    const verified = await fixture.askDms("/auth/verify-2fa", async (base) => ({
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
    const read = await fixture.askDms("/api/_auth/session", async (base) => ({
      method: "GET",
      origin: false,
      cookie: await signedIn(base),
    }));
    expect(read.body).toMatchObject({
      user: USER,
      session: { activeTenantId: "t1" },
    });
    const renewed = await fixture.askDms(
      "/api/_auth/session",
      async (base) => ({
        cookie: await signedIn(base),
      }),
    );
    expect(renewed.body).toMatchObject({ session: { activeTenantId: "t2" } });
    const ended = await fixture.askDms("/api/_auth/session", async (base) => ({
      method: "DELETE",
      cookie: await signedIn(base),
    }));
    expect(ended.calls.map((call) => call.path)).toEqual(["/api/auth/logout"]);
    const other = await fixture.askDms("/api/_auth/session", {
      method: "PUT",
      origin: false,
    });
    expect(other.status).toBe(405);
  });
}

function registerAccountRouteTests(
  fixture: ReturnType<typeof createServerRoutesFixture>,
) {
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
      const answer = await fixture.askDms(`/auth/${action}`, async (base) => {
        const cookie = await twoAccounts(base);
        return { cookie, body: { accountId: accountOf(cookie) } };
      });
      expect(answer.status).toBe(200);
    }
    const expired = await fixture.askDms("/auth/switch-account", {
      body: { accountId: randomUUID() },
    });
    expect(expired.status).toBe(401);
  });

  it("switches tenant, opens a declared session and relays the 2FA e-mail", async () => {
    const tenant = await fixture.askDms(
      "/auth/switch-tenant",
      async (base) => ({
        cookie: await cookiesOf(base, "/auth/login", {
          body: { email: "ada@example.test", password: "secret" },
        }),
        body: { tenantId: "t2" },
      }),
    );
    expect(tenant.body).toMatchObject({ success: true });
    expect(
      (
        await fixture.askDms("/auth/switch-tenant", {
          body: { tenantId: "t2" },
        })
      ).status,
    ).toBe(401);
    const established = await fixture.askDms("/auth/establish", {
      body: { endpoint: ESTABLISH_ENDPOINT, payload: { token: "x" } },
    });
    expect(established.status).toBe(200);
    const refused = await fixture.askDms("/auth/establish", {
      body: { endpoint: "/api/auth/login", payload: {} },
    });
    expect(refused.status).toBe(403);
    expect(refused.calls).toEqual([]);
    const relayed = await fixture.askDms("/auth/request-2fa-email", {
      body: { token: "challenge-1" },
    });
    expect(relayed.calls.map((call) => call.path)).toEqual([
      "/api/auth/request-2fa-email",
    ]);
  });
}

function registerServiceRouteTests(
  fixture: ReturnType<typeof createServerRoutesFixture>,
) {
  it("runs a provider sign-in: start, callback, handoff", async () => {
    const start = await fixture.askDms(
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
    const callback = await fixture.askDms(
      "/auth/oauth/github/callback?code=c&state=state-1",
      async (base) => ({
        method: "GET",
        origin: false,
        cookie: await flow(base),
      }),
    );
    expect(callback.location).toBe("/auth/oauth/complete?redirect=%2Fprojects");
    expect(callback.calls[0].relay).toBe(RELAY_SECRET);
    const forged = await fixture.askDms(
      "/auth/oauth/github/callback?code=c&state=other",
      async (base) => ({
        method: "GET",
        origin: false,
        cookie: await flow(base),
      }),
    );
    expect(forged.location).toBe("/auth?oauth_error=error.oauth.invalid_state");
    const cancelled = await fixture.askDms(
      "/auth/oauth/github/callback?error=access_denied",
      {
        method: "GET",
        origin: false,
      },
    );
    expect(cancelled.location).toBe("/auth?oauth_error=error.oauth.cancelled");
    const handoff = await fixture.askDms("/auth/oauth/handoff", {});
    expect(handoff.body).toEqual({ kind: "none" });
  });

  it("renders e-mails for the backend's service token only", async () => {
    const refused = await fixture.askDms("/api/html/render", {
      origin: false,
      body: { templateName: "EmailLayout", props: {} },
    });
    expect(refused.status).toBe(401);
    expect(refused.body).toEqual({ message: "Invalid service token" });

    const missing = await fixture.askDms("/api/html/render", () =>
      Promise.resolve({
        origin: false,
        headers: { "x-dms-service-token": renderToken() },
        body: { templateName: "EmailLayout", props: {} },
      }),
    );
    expect(missing.status).toBe(404);
  });
}

function registerServerSecretTests(
  fixture: ReturnType<typeof createServerRoutesFixture>,
) {
  it("prefers the manifest's secrets to the environment's", async () => {
    const environmentSecrets = {
      render: process.env.DMS_HTML_RENDER_SECRET,
      relay: process.env.DMS_OAUTH_RELAY_SECRET,
    };
    process.env.DMS_HTML_RENDER_SECRET = "a-stale-render-secret";
    process.env.DMS_OAUTH_RELAY_SECRET = "a-stale-relay-secret";
    try {
      const accepted = await fixture.askDms("/api/html/render", {
        origin: false,
        headers: { "x-dms-service-token": renderToken() },
        body: { templateName: "EmailLayout", props: {} },
      });

      expect(accepted.status).toBe(404);
      const start = await fixture.askDms("/auth/oauth/github/start", {
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
}
