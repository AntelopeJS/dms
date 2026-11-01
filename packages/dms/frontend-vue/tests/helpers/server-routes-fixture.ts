import { createServer, type Server } from "node:http";
import { afterAll, beforeAll } from "vitest";
import { serveModuleRoutes } from "@antelopejs/dms-frontend/templates/vue/server/module-testing.mjs";
import dmsServer from "../../dms.server";
import { isFunction } from "../../layers/dms-core/app/utils/type-check";
import {
  RELAY_SECRET,
  RENDER_SECRET,
  ESTABLISH_ENDPOINT,
  backendAnswer,
  calls,
  readBody,
  listen,
  close,
  ask,
} from "./server-routes-fixtures";

export function createServerRoutesFixture() {
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
        // SAFETY: The requests below send one relay header, never a repeated header array.
        relay: request.headers["x-dms-oauth-relay"] as string | undefined,
        // SAFETY: The requests below send one forwarded-for header, never a repeated header array.
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
  ): ReturnType<typeof ask> {
    const options = isFunction(init) ? await init(moduleRoutes.url) : init;
    return ask(moduleRoutes.url, path, options);
  }
  return {
    get moduleRoutes() {
      return moduleRoutes;
    },
    askDms,
  };
}
