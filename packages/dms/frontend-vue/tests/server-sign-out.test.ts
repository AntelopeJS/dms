import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_RECONFIRM_AFTER_MS } from "@antelopejs/dms-frontend/templates/vue/server/auth-hooks.mjs";
import {
  handleModuleRoute,
  reconfirmSession,
} from "@antelopejs/dms-frontend/templates/vue/server/module-server.mjs";
import { requestOwner } from "@antelopejs/dms-frontend/templates/vue/server/request-routing.mjs";
import { isServerRequest } from "@antelopejs/dms-frontend/templates/vue/server/request-target.mjs";
import { createServerRoutesFixture } from "./helpers/server-routes-fixture";
import {
  answerOverrides,
  ask,
  close,
  cookiesOf,
  listen,
} from "./helpers/server-routes-fixtures";

describe("signing out of the DMS", () => {
  const fixture = createServerRoutesFixture();

  afterEach(() => {
    answerOverrides.clear();
    vi.useRealTimers();
  });

  /** Serves the DMS's routes the way the frontend server does: it reconfirms the session before a route answers. */
  async function serveReconfirming(): Promise<{
    base: string;
    stop: () => Promise<void>;
  }> {
    const { modules } = fixture.moduleRoutes;
    const server = createServer(async (request, response) => {
      if (!isServerRequest(request)) return void response.writeHead(400).end();
      const { pathname } = new URL(request.url, "http://frontend.local");
      const owner = requestOwner(
        request.method,
        pathname,
        modules,
        () => false,
      );
      await reconfirmSession(request, response, owner, pathname, modules);
      if (!(await handleModuleRoute(request, response, pathname, modules)))
        response.writeHead(404).end();
    });
    return { base: await listen(server), stop: () => close(server) };
  }

  it("revokes the session on the backend when its renewal cannot reach the backend", async () => {
    const { base, stop } = await serveReconfirming();
    try {
      const cookie = await cookiesOf(base, "/auth/login", {
        body: { email: "ada@example.test", password: "secret" },
      });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.now() + SESSION_RECONFIRM_AFTER_MS + 1000);
      answerOverrides.set("/api/auth/refresh", { status: 502, body: {} });
      const ended = await ask(base, "/api/_auth/session", {
        method: "DELETE",
        cookie,
      });
      expect(ended.calls.map((call) => call.path)).toEqual([
        "/api/auth/refresh",
        "/api/auth/logout",
      ]);
      expect(ended.calls[1].body).toEqual({ token: "refresh-1" });
    } finally {
      await stop();
    }
  });
});
