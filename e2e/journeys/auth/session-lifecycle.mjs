import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { isNumber, isRecord, stringIn as stringField } from "../../rows.mjs";
import { createRole, joinedMember } from "../settings-members/steps.mjs";
import { storedRoles } from "../settings-roles/steps.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 * @typedef {import("@antelopejs/dms/e2e").Tab} Tab
 * @typedef {{ name: string, value: string }} Jarred A cookie as the browser sends it
 * @typedef {{ origin: string, session: Jarred, account: Jarred, accountId: string, all: Jarred[] }} Jar The frontend cookies a sign-in leaves
 * @typedef {{ status: number, body: unknown }} Answer
 */

const MEMBERS = "/settings/workspace/members";
const ON_MEMBERS = new RegExp(`^${MEMBERS}$`);
const SESSION_COOKIE = /^dms_session_[0-9a-f]+$/;
const ACCOUNT_COOKIE = /^dms_account_([0-9a-f]{32})(_[0-9a-f]+)?$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_LIFETIME_MS = 30 * DAY_MS;
const ROLES_EDIT = "settings.workspace.roles.table.edit";
const ROLES_API = "/dms/pages/settings/workspace/roles";

/**
 * The frontend's sealed-cookie codec, keyed by the run's `DMS_SESSION_SECRET`
 * and bound to the cookie's name as AES-GCM additional data.
 *
 * @param {Ctx} ctx The journey
 */
function codec(ctx) {
  const key = createHash("sha256").update(ctx.state.secrets.DMS_SESSION_SECRET ?? "").digest();
  return {
    /**
     * @param {string} name The cookie's name in the jar
     * @param {string} value The cookie's value
     * @returns {unknown} What it seals, `undefined` when it does not open under `name`
     */
    open(name, value) {
      try {
        const payload = Buffer.from(value, "base64url");
        const decipher = createDecipheriv("aes-256-gcm", key, payload.subarray(0, 12), { authTagLength: 16 });
        decipher.setAuthTag(payload.subarray(12, 28));
        decipher.setAAD(Buffer.from(name));
        return JSON.parse(Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString());
      } catch {
        return undefined;
      }
    },
    /**
     * @param {string} name The cookie's name in the jar
     * @param {unknown} value What to seal
     * @returns {string} The cookie's value
     */
    seal(name, value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(name));
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
    },
  };
}

/**
 * @param {string} hex An account id without dashes
 * @returns {string} The account id as the stored account names it
 */
function dashed(hex) {
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

/**
 * @param {Ctx} ctx The journey
 * @param {Tab} tab A tab signed in through the form
 * @returns {Promise<Jar>} The session and stored-account cookies the sign-in left
 */
async function readJar(ctx, tab) {
  const origin = new URL(ctx.state.webUrl).origin;
  const all = (await tab.page.context().cookies(origin)).map(({ name, value }) => ({ name, value }));
  const session = all.find((cookie) => SESSION_COOKIE.test(cookie.name));
  const account = all.find((cookie) => ACCOUNT_COOKIE.test(cookie.name));
  const hex = ACCOUNT_COOKIE.exec(account?.name ?? "")?.[1] ?? "";
  await ctx.verify(
    "the sign-in leaves a session cookie and a stored-account cookie",
    [
      ctx.holds("a session cookie", session, all.map((cookie) => cookie.name).join(", ")),
      ctx.holds("a stored-account cookie", account, all.map((cookie) => cookie.name).join(", ")),
    ],
    { critical: true },
  );
  return { origin, session: session ?? { name: "", value: "" }, account: account ?? { name: "", value: "" }, accountId: dashed(hex), all };
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
 * Calls the frontend server same-origin with exactly `cookies`, and records
 * the request and the answer without the cookie values.
 *
 * @param {Ctx} ctx The journey
 * @param {string} origin The frontend's origin
 * @param {Jarred[]} cookies What the call carries
 * @param {string} label What the call does
 * @param {{ method: string, path: string, body?: unknown }} request What to send
 * @returns {Promise<Answer>} The answer
 */
async function callFrontend(ctx, origin, cookies, label, request) {
  /** @type {Record<string, string>} */
  const headers = { cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; "), origin, "sec-fetch-site": "same-origin" };
  if (request.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(new URL(request.path, origin), {
    method: request.method,
    headers,
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    redirect: "manual",
  });
  const text = await response.text();
  const answer = { status: response.status, body: text ? parseBody(text) : null };
  const folder = ctx.step(`frontend ${label}`);
  writeFileSync(join(folder, "request.json"), `${JSON.stringify({ ...request, cookieNames: cookies.map((cookie) => cookie.name) }, null, 2)}\n`);
  writeFileSync(join(folder, "response.json"), `${JSON.stringify(answer, null, 2)}\n`);
  return answer;
}

/**
 * @param {Answer} answer What `GET /api/_auth/session` answered
 * @returns {string} The email of the user the frontend reads from the cookies, `""` when none
 */
function signedInEmail(answer) {
  return stringField(isRecord(answer.body) ? answer.body.user : undefined, "email") ?? "";
}

/**
 * @param {Ctx} ctx The journey
 * @param {Jar} jar Where the cookies go
 * @param {Jarred[]} cookies What the frontend receives
 * @param {string} label What the cookies are
 * @returns {Promise<string>} The email of the user the frontend reads from them
 */
async function sessionUser(ctx, jar, cookies, label) {
  return signedInEmail(await callFrontend(ctx, jar.origin, cookies, `reads the session from ${label}`, { method: "GET", path: "/api/_auth/session" }));
}

/**
 * Opens the members page in a browser that holds only `cookies`.
 *
 * @param {Ctx} ctx The journey
 * @param {Jar} jar Where the cookies go
 * @param {Jarred[]} cookies What the browser holds
 * @param {string} label The tab's account label, one fresh browser context each
 * @returns {Promise<Tab>} The tab, on whatever page the visit ended
 */
async function visitWith(ctx, jar, cookies, label) {
  const tab = await ctx.tab(label);
  const domain = new URL(jar.origin).hostname;
  await tab.page.context().addCookies(cookies.map((cookie) => ({ ...cookie, domain, path: "/", httpOnly: true, sameSite: "Lax" })));
  await tab.goto(MEMBERS);
  return tab;
}

/** One journey over a session's whole life, each step a replay the frontend or the backend must refuse. */
export const sessionLifecycleJourneys = [
  {
    id: "session-lifecycle-refuses-replays",
    title: "a session refuses each replay of its life: a stored-account cookie as the session, a sealed value under another name, a stamp past its lifetime, a self-granted *, and the cookies copied before a sign-out",
    entryPoint: "/auth sign-in form, GET /api/_auth/session, POST /auth/switch-account, PUT /dms/pages/settings/workspace/roles/:id, account menu > Logout",
    knownFailures: {
      "the user behind the copied session":
        "GET /api/_auth/session with the session cookie copied before the logout answers 200 with the signed-out owner's user: the frontend reads the sealed cookie and checks no revocation, while the backend refuses its tokens",
    },
    async run(/** @type {Ctx} */ ctx) {
      const admin = ctx.adminCredentials();
      const sealed = codec(ctx);
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      const jar = await readJar(ctx, tab);
      const opened = sealed.open(jar.session.name, jar.session.value);
      if (!isRecord(opened) || !isNumber(opened.updatedAt)) throw new Error("the session cookie does not open with the run's DMS_SESSION_SECRET");
      const stamp = (/** @type {number} */ updatedAt) => ({ name: jar.session.name, value: sealed.seal(jar.session.name, { ...opened, updatedAt }) });
      await ctx.verify(
        "the frontend reads the signed-in owner from the session cookie, as from one the journey seals with the run's secret",
        [
          ctx.equal("the user behind the session cookie", await sessionUser(ctx, jar, [jar.session], "the session cookie"), admin.email),
          ctx.equal("the user behind a session the journey reseals now", await sessionUser(ctx, jar, [stamp(Date.now())], "a session resealed now"), admin.email),
        ],
        { critical: true },
      );
      const resealedTab = await visitWith(ctx, jar, [stamp(Date.now())], "resealed-session");
      await ctx.verify("a browser holding only a session the journey reseals now opens the members page", [resealedTab.at(ON_MEMBERS)], { critical: true });

      const asSession = { name: jar.session.name, value: jar.account.value };
      const sessionUnderAccountName = { name: jar.session.name, value: sealed.seal(jar.account.name, { ...opened, updatedAt: Date.now() }) };
      const replayed = await visitWith(ctx, jar, [sessionUnderAccountName], "module-cookie-replay");
      await ctx.verify("a value sealed for the sign-in module's stored-account cookie does not open as the session, even when it is session-shaped", [
        ctx.holds("the stored account opens under its own name", isRecord(sealed.open(jar.account.name, jar.account.value)), jar.account.name),
        ctx.equal("the user behind the stored account as the session", await sessionUser(ctx, jar, [asSession], "the stored account as the session"), ""),
        ctx.equal(
          "the user behind a session sealed for the stored-account cookie",
          await sessionUser(ctx, jar, [sessionUnderAccountName], "a session sealed for the stored-account cookie"),
          "",
        ),
        replayed.at(/^\/auth/),
      ]);

      const otherId = randomUUID();
      const moved = { name: `dms_account_${otherId.replaceAll("-", "")}${ACCOUNT_COOKIE.exec(jar.account.name)?.[2] ?? ""}`, value: jar.account.value };
      const switched = await callFrontend(ctx, jar.origin, [jar.session, moved], "switches to the stored account moved under another account's name", {
        method: "POST",
        path: "/auth/switch-account",
        body: { accountId: otherId },
      });
      await ctx.verify("a stored account moved under another account's cookie name does not open there", [ctx.status(switched, 401)]);

      const expired = stamp(Date.now() - SESSION_LIFETIME_MS - DAY_MS);
      const future = stamp(Date.now() + DAY_MS);
      const expiredTab = await visitWith(ctx, jar, [expired], "expired-session");
      await ctx.verify("a session stamped past its 30-day lifetime, or a day ahead, does not open", [
        ctx.equal("the user behind a session stamped 31 days ago", await sessionUser(ctx, jar, [expired], "a session stamped 31 days ago"), ""),
        ctx.equal("the user behind a session stamped a day ahead", await sessionUser(ctx, jar, [future], "a session stamped a day ahead"), ""),
        expiredTab.at(/^\/auth/),
      ]);

      const roleName = ctx.unique("Role editor");
      const roleId = await createRole(ctx, roleName, [ROLES_EDIT]);
      await joinedMember(ctx, tab, { firstName: "Rita", roleName });
      const wildcard = await ctx.api("the member adds * to their own role", {
        method: "PUT",
        path: `${ROLES_API}/${roleId}`,
        as: "rita",
        body: { name: roleName, description: "", permissions: [ROLES_EDIT, "*"] },
      });
      const kept = (await storedRoles(ctx, "read the role after the refused save")).find((role) => role._id === roleId);
      const listing = await ctx.api("the member reads the modules listing", { method: "GET", path: "/dms/modules-listing", as: "rita" });
      const store = await ctx.api("the member reads the store listing", { method: "GET", path: "/dms/store/listing", as: "rita" });
      await ctx.verify("a role editor cannot grant * to their own role, nor pass the owner checks", [
        ctx.status(wildcard, 403),
        ctx.holds("the role does not store *", kept && !kept.permissions?.includes("*"), JSON.stringify(kept?.permissions)),
        ctx.status(listing, 403),
        ctx.status(store, 403),
      ]);

      await tab.goto("/");
      await tab.click({ role: "button", name: "Verify Admin" });
      const copied = (await tab.page.context().cookies(jar.origin)).map(({ name, value }) => ({ name, value }));
      const before = await callFrontend(ctx, jar.origin, copied, "reads the account with the cookies copied just before the logout", { method: "GET", path: "/api/auth/me" });
      await ctx.verify("the cookies copied just before the logout open the session", [ctx.status(before, 200)], { critical: true });
      await tab.click({ role: "menuitem", name: "Logout" });
      await ctx.verify("the logout returns to sign-in", [tab.at(/^\/auth/)]);
      const me = await callFrontend(ctx, jar.origin, copied, "reads the account with the cookies copied before the logout", { method: "GET", path: "/api/auth/me" });
      const renewed = await callFrontend(ctx, jar.origin, copied, "renews the session from the cookies copied before the logout", { method: "POST", path: "/api/_auth/session" });
      const revived = await callFrontend(ctx, jar.origin, copied, "switches to the stored account copied before the logout", {
        method: "POST",
        path: "/auth/switch-account",
        body: { accountId: jar.accountId },
      });
      const replayTab = await visitWith(ctx, jar, copied, "after-logout-replay");
      await ctx.verify("the cookies copied before the logout no longer open the session, nor its stored account", [
        ctx.equal("the user behind the copied session", await sessionUser(ctx, jar, copied, "the cookies copied before the logout"), ""),
        ctx.status(me, 401),
        ctx.equal("the user a renewal from the copied session shows", signedInEmail(renewed), ""),
        ctx.status(revived, 401),
        replayTab.at(/^\/auth/),
      ]);
    },
  },
];
