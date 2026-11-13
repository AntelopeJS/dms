import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord } from "../../../../../packages/dms/bin/control/json.mjs";

/**
 * @typedef {import("../../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("playwright-core").BrowserContext} BrowserContext
 * @typedef {import("playwright-core").Cookie} BrowserCookie
 * @typedef {{ name: string, value: string, path: string, httpOnly: boolean, secure: boolean, maxAge?: number, expires?: number, sameSite?: "Strict" | "Lax" | "None" }} SetCookie
 * @typedef {{ status: number, body: unknown, setCookies: SetCookie[] }} Answer
 */

const ACCOUNT_COOKIE = /^dms_account_([0-9a-f]{32})(?:_[0-9a-f]+)?$/;
const ACCOUNT_COOKIE_PREFIX = "dms_account_";

/**
 * @param {string} value A `SameSite` attribute value
 * @returns {SetCookie["sameSite"]} The value as the browser takes it
 */
function sameSite(value) {
  const lower = value.toLowerCase();
  if (lower === "strict") return "Strict";
  if (lower === "lax") return "Lax";
  if (lower === "none") return "None";
  return undefined;
}

/**
 * @param {string} line One `Set-Cookie` header
 * @returns {SetCookie} The cookie it sets
 */
function parseSetCookie(line) {
  const [pair = "", ...attributes] = line.split(";").map((part) => part.trim());
  const at = pair.indexOf("=");
  /** @type {SetCookie} */
  const cookie = { name: pair.slice(0, at), value: pair.slice(at + 1), path: "/", httpOnly: false, secure: false };
  for (const attribute of attributes) {
    const [key = "", ...rest] = attribute.split("=");
    const value = rest.join("=");
    const name = key.toLowerCase();
    if (name === "path") cookie.path = value;
    if (name === "max-age") cookie.maxAge = Number(value);
    if (name === "expires") cookie.expires = Date.parse(value);
    if (name === "httponly") cookie.httpOnly = true;
    if (name === "secure") cookie.secure = true;
    if (name === "samesite") cookie.sameSite = sameSite(value);
  }
  return cookie;
}

/**
 * @param {SetCookie} cookie A cookie an answer sets
 * @returns {boolean} Whether the answer deletes it rather than sets it
 */
function clears(cookie) {
  if (cookie.value === "") return true;
  if (cookie.maxAge !== undefined) return cookie.maxAge <= 0;
  return cookie.expires !== undefined && cookie.expires <= Date.now();
}

/**
 * @param {SetCookie} cookie A cookie an answer sets
 * @param {string} domain The host the browser stored the account's cookies for
 * @returns {Parameters<BrowserContext["addCookies"]>[0][number]} The cookie as the browser stores it
 */
function forBrowser(cookie, domain) {
  const lifetime = cookie.maxAge === undefined ? undefined : Date.now() / 1000 + cookie.maxAge;
  const expires = lifetime ?? (cookie.expires === undefined ? -1 : cookie.expires / 1000);
  return { name: cookie.name, value: cookie.value, domain, path: cookie.path, expires, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite };
}

/**
 * @param {SetCookie[]} cookies What an answer sets
 * @param {string} name A cookie name
 * @returns {string} What the answer does to that cookie, with its lifetime
 */
function effectOn(cookies, name) {
  const cookie = cookies.find((candidate) => candidate.name === name);
  if (!cookie) return `${name}: not touched`;
  return `${name}: ${clears(cookie) ? "cleared" : "set"} Max-Age=${cookie.maxAge ?? "none"}`;
}

/**
 * Calls the frontend server as the browser does, same origin and with the
 * cookies `context` holds now, and records what it answers. Unlike the page,
 * it leaves the context's cookies as they are, so the journey chooses which
 * answer the browser applies. Cookie values never reach the evidence.
 *
 * @param {Ctx} ctx The journey
 * @param {BrowserContext} context The browser context whose cookies the call carries
 * @param {string} label What the call does
 * @param {{ method: string, path: string, body?: unknown }} request What to send
 * @returns {Promise<Answer>} The answer
 */
async function callFrontend(ctx, context, label, request) {
  const url = new URL(request.path, ctx.state.webUrl);
  const cookies = await context.cookies(url.origin);
  /** @type {Record<string, string>} */
  const headers = { cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "), origin: url.origin, "sec-fetch-site": "same-origin" };
  if (request.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(url, { method: request.method, headers, body: request.body === undefined ? undefined : JSON.stringify(request.body), redirect: "manual" });
  const text = await response.text();
  const setCookies = response.headers.getSetCookie().map(parseSetCookie);
  const answer = { status: response.status, body: text ? parseBody(text) : null, setCookies };
  const folder = ctx.step(`frontend ${label}`);
  const summary = setCookies.map(({ value, ...rest }) => ({ ...rest, cleared: clears({ ...rest, value }) }));
  writeFileSync(join(folder, "request.json"), `${JSON.stringify({ method: request.method, path: request.path, body: request.body, cookieNames: cookies.map((cookie) => cookie.name) }, null, 2)}\n`);
  writeFileSync(join(folder, "response.json"), `${JSON.stringify({ status: answer.status, body: answer.body, setCookies: summary }, null, 2)}\n`);
  return answer;
}

/**
 * @param {string} text A response body
 * @returns {unknown} Its JSON, or the text when it is not JSON
 */
function parseBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * @param {BrowserContext} context The browser context
 * @param {string} origin The frontend's origin
 * @returns {Promise<string[]>} The names of the cookies it holds for the frontend
 */
async function cookieNames(context, origin) {
  return (await context.cookies(origin)).map((cookie) => cookie.name);
}

/**
 * @param {string} hex An account id without dashes
 * @returns {string} The account id as the stored account names it
 */
function dashed(hex) {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

/** An account the logout ended, whose renewal answers last. */
export const storedAccountJourneys = [
  {
    id: "stored-account-refused-after-logout",
    title: "a renewal that answers after the logout does not bring the account back: the switcher refuses it and the next renewal clears its stored cookie",
    entryPoint: "POST /api/_auth/session, account menu > Logout, POST /auth/switch-account",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      const context = tab.page.context();
      const origin = new URL(ctx.state.webUrl).origin;
      const stored = (await cookieNames(context, origin)).map((name) => ACCOUNT_COOKIE.exec(name)).find((match) => match !== null);
      const accountCookie = stored?.[0] ?? "";
      const accountId = dashed(stored?.[1] ?? "");

      const renewal = await callFrontend(ctx, context, "renews the session", { method: "POST", path: "/api/_auth/session" });
      const sessionCookies = renewal.setCookies.filter((cookie) => !cookie.name.startsWith(ACCOUNT_COOKIE_PREFIX)).map((cookie) => cookie.name);
      await ctx.verify(
        "the sign-in stored the account and a renewal answers with the cookies that keep it signed in",
        [
          ctx.holds("the browser holds the stored account", accountCookie !== "", accountCookie),
          ctx.status({ status: renewal.status, body: renewal.body }, 200),
          ctx.holds("the renewal sets the stored account", renewal.setCookies.some((cookie) => cookie.name === accountCookie && !clears(cookie)), effectOn(renewal.setCookies, accountCookie)),
          ctx.holds("the renewal sets a session cookie", sessionCookies.length > 0 && renewal.setCookies.every((cookie) => !clears(cookie)), sessionCookies.join(", ")),
        ],
        { critical: true },
      );

      await tab.click({ role: "button", name: "Verify Admin" });
      await tab.click({ role: "menuitem", name: "Logout" });
      const afterLogout = await cookieNames(context, origin);
      await ctx.verify("the logout returns to sign-in and the browser drops the session and the stored account", [
        tab.at(/^\/auth/),
        ctx.holds("the stored account is gone", !afterLogout.includes(accountCookie), afterLogout.join(", ")),
        ctx.holds("the session cookies are gone", sessionCookies.every((name) => !afterLogout.includes(name)), afterLogout.join(", ")),
      ]);

      const restore = async () => {
        await context.clearCookies();
        await context.addCookies(renewal.setCookies.map((cookie) => forBrowser(cookie, new URL(origin).hostname)));
      };
      await restore();
      const restored = await cookieNames(context, origin);
      await ctx.verify(
        "the renewal's answer, arriving after the logout, puts the cookies back in the browser",
        [ctx.holds("the stored account and the session are back", [accountCookie, ...sessionCookies].every((name) => restored.includes(name)), restored.join(", "))],
        { critical: true },
      );

      const switched = await callFrontend(ctx, context, "switches to the account", { method: "POST", path: "/auth/switch-account", body: { accountId } });
      await ctx.verify("switching to the revived account is refused and clears its stored cookie", [
        ctx.status(switched, 401),
        ctx.holds("the answer clears the stored account", switched.setCookies.some((cookie) => cookie.name === accountCookie && clears(cookie)), effectOn(switched.setCookies, accountCookie)),
      ]);

      await restore();
      const renewed = await callFrontend(ctx, context, "renews the revived session", { method: "POST", path: "/api/_auth/session" });
      const view = isRecord(renewed.body) ? renewed.body : {};
      await ctx.verify("renewing the revived session runs signed out and clears the session and the stored account", [
        ctx.status(renewed, 200),
        ctx.holds("the answer shows no user", !view.user, JSON.stringify(renewed.body)),
        ctx.holds("the answer clears the session cookies", sessionCookies.every((name) => renewed.setCookies.some((cookie) => cookie.name === name && clears(cookie))), sessionCookies.map((name) => effectOn(renewed.setCookies, name)).join("; ")),
        ctx.holds("the answer clears the stored account", renewed.setCookies.some((cookie) => cookie.name === accountCookie && clears(cookie)), effectOn(renewed.setCookies, accountCookie)),
      ]);
    },
  },
];
