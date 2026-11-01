import { createHmac, randomUUID } from "node:crypto";
import {
  IncomingMessage,
  ServerResponse,
  type Server,
} from "node:http";
import { Socket } from "node:net";

import {
  readSealedCookie,
  writeSealedCookie,
} from "@antelopejs/dms-frontend/templates/vue/server/auth/session.mjs";
import {
  isObject,
  isString,
} from "../../layers/dms-core/app/utils/type-check";

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
function backendAnswer(
  path: string,
  body: { password?: string; email?: string; token?: string },
) {
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

function readBody(
  request: IncomingMessage,
): Promise<Parameters<typeof backendAnswer>[1]> {
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
  if (!address || !isObject(address)) throw new Error("no address");
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
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.origin !== false) headers.set("origin", base);
  if (init.body !== undefined) headers.set("content-type", "application/json");
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
  const headers = new Headers({
    origin: base,
    "content-type": "application/json",
  });
  if (init?.cookie) headers.set("cookie", init.cookie);
  const response = await fetch(`${base}${path}`, {
    method: init?.method ?? "POST",
    headers,
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

/** The Cookie header pair a browser would send for a sealed cookie of `value`. */
function sealedCookie(name: string, value: unknown): string {
  const response = new ServerResponse(new IncomingMessage(new Socket()));
  writeSealedCookie(response, name, value, undefined);
  const header = response.getHeader("set-cookie");
  const cookie = Array.isArray(header) ? header[0] : header;
  if (!isString(cookie)) throw new Error("no cookie was written");
  return cookie.split(";", 1)[0];
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

export {
  RELAY_SECRET,
  RENDER_SECRET,
  ESTABLISH_ENDPOINT,
  USER,
  backendAnswer,
  calls,
  readBody,
  listen,
  close,
  ask,
  cookiesOf,
  renderToken,
  sealedCookie,
};
