/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("../../../../packages/dms/bin/control/tab.mjs").Tab} Tab
 */

const MEMBERS = "/settings/workspace/members";
const RESET_CODE = /verification code is:\s*([A-Z0-9]{6})/;

function login(/** @type {Ctx} */ ctx, label, email, password) {
  return ctx.api(label, { method: "POST", path: "/api/auth/login", as: "anon", body: { email, password } });
}

async function fillLoginForm(/** @type {Tab} */ tab, email, password) {
  await tab.fill({ role: "textbox", name: "Email address" }, email);
  await tab.fill({ role: "textbox", name: "Password", exact: true }, password);
  await tab.click({ role: "button", name: "Login", exact: true });
}

async function requestResetCode(/** @type {Ctx} */ ctx, /** @type {Tab} */ tab, email) {
  await tab.goto("/auth/forgot");
  await tab.fill({ role: "textbox", name: "Email address" }, email);
  await tab.click({ role: "button", name: "Send the code" });
  await ctx.verify("the reset page asks for the emailed code", [
    tab.visible({ role: "heading", name: "Check your inbox" }),
    tab.at(/^\/auth\/forgot-validation/),
  ]);
  const mail = await ctx.mail((message) => message.to.some((to) => to.includes(email)) && RESET_CODE.test(message.text ?? ""));
  await ctx.verify("the account's address receives a reset code", [
    ctx.holds("a reset email arrived", mail.match, `${mail.messages.length} messages captured`),
  ]);
  return RESET_CODE.exec(mail.match?.text ?? "")?.[1] ?? "";
}

async function typeCode(/** @type {Tab} */ tab, code) {
  for (const [index, character] of [...code].entries()) {
    await tab.fill({ role: "textbox", name: `pin input ${index + 1} of 6` }, character);
  }
}

/** Sign-in, sign-out, the sign-in redirect and password recovery. */
export const journeys = [
  {
    id: "login-form-persists",
    title: "the sign-in form opens the dashboard and the session survives a reload and a backend restart",
    entryPoint: "/auth sign-in form",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await ctx.verify("the dashboard shows the signed-in account", [
        tab.visible({ role: "button", name: "Verify Admin" }),
      ]);
      await tab.reload();
      await ctx.verify("a reload keeps the session", [tab.at(/^\/(?!auth)/), tab.visible({ role: "button", name: "Verify Admin" })]);
      await ctx.restartBackend();
      await tab.goto(MEMBERS);
      await ctx.verify("the session survives a backend restart", [
        tab.at(new RegExp(`^${MEMBERS}$`)),
        tab.visible({ role: "heading", name: "Members", exact: true }),
      ]);
      const me = await ctx.api("read the signed-in account", { method: "GET", path: "/api/auth/me" });
      await ctx.verify("the API reads back the same account", [
        ctx.status(me, 200),
        ctx.equal("email", me.body?.email, ctx.adminCredentials().email),
      ]);
    },
  },
  {
    id: "login-wrong-password",
    title: "a wrong password keeps the visitor on the sign-in page with an error, and the API refuses it",
    entryPoint: "/auth sign-in form, POST /api/auth/login",
    async run(/** @type {Ctx} */ ctx) {
      const admin = ctx.adminCredentials();
      const tab = await ctx.tab("stranger");
      await tab.goto("/auth");
      await fillLoginForm(tab, admin.email, `${admin.password}x`);
      await ctx.verify("the form says the credentials are wrong", [
        tab.shows(/The provided credentials are incorrect/),
        tab.at(/^\/auth/),
      ]);
      const answer = await login(ctx, "sign in with a wrong password", admin.email, `${admin.password}x`);
      await ctx.verify("the API answers 401", [
        ctx.status(answer, 401),
        ctx.equal("error", answer.body, "error.invalid_credentials"),
      ]);
    },
  },
  {
    id: "protected-page-redirects",
    title: "an anonymous visit to a settings page goes to sign-in and returns to the page afterwards",
    entryPoint: "/settings/workspace/members as a visitor",
    async run(/** @type {Ctx} */ ctx) {
      const admin = ctx.adminCredentials();
      const tab = await ctx.tab("stranger");
      await tab.goto(MEMBERS);
      await ctx.verify("the visitor lands on sign-in with the page to return to", [
        tab.at(/^\/auth/),
        ctx.holds("redirect names the page", tab.page.url().includes(encodeURIComponent(MEMBERS)), tab.page.url()),
      ]);
      await fillLoginForm(tab, admin.email, admin.password);
      await ctx.verify("after signing in the visitor is back on the page", [tab.at(new RegExp(`^${MEMBERS}$`))]);
      const anonymous = await ctx.api("read the members anonymously", { method: "GET", path: "/api/tables/members/list", as: "anon" });
      await ctx.verify("the members API refuses an anonymous caller", [
        ctx.holds("401 or 403", [401, 403].includes(anonymous.status), anonymous.status),
      ]);
    },
  },
  {
    id: "logout-ends-session",
    title: "Logout from the account menu ends the session, and the settings page asks to sign in again",
    entryPoint: "account menu > Logout",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.click({ role: "button", name: "Verify Admin" });
      await tab.click({ role: "menuitem", name: "Logout" });
      await ctx.verify("the browser is back on sign-in", [tab.at(/^\/auth/)]);
      await tab.goto(MEMBERS);
      await ctx.verify("the settings page asks to sign in again", [tab.at(/^\/auth/)]);
    },
  },
  {
    id: "forgot-password-resets",
    title: "the emailed code resets the password: the new one signs in and the old one is refused",
    entryPoint: "/auth/forgot, /auth/forgot-validation, /auth/recover",
    async run(/** @type {Ctx} */ ctx) {
      const admin = ctx.adminCredentials();
      const tab = await ctx.tab("stranger");
      const code = await requestResetCode(ctx, tab, admin.email);
      await typeCode(tab, code);
      await ctx.verify("the code opens the new password form", [tab.visible({ role: "heading", name: "Reset your password" })]);
      const fresh = ctx.password();
      await tab.fill({ role: "textbox", name: "New password", exact: true }, fresh);
      await tab.click({ role: "button", name: "Save the new password" });
      await ctx.verify("the page confirms the change", [tab.shows(/Password changed|Your password has been reset/)]);
      const withNew = await login(ctx, "sign in with the new password", admin.email, fresh);
      const withOld = await login(ctx, "sign in with the old password", admin.email, admin.password);
      await ctx.verify("only the new password signs in", [
        ctx.holds("new password accepted", withNew.status === 200 && withNew.body?.access_token, withNew.status),
        ctx.status(withOld, 401),
      ]);
    },
  },
  {
    id: "forgot-password-wrong-code",
    title: "a wrong reset code is refused and the password does not change",
    entryPoint: "/auth/forgot-validation",
    async run(/** @type {Ctx} */ ctx) {
      const admin = ctx.adminCredentials();
      const tab = await ctx.tab("stranger");
      const code = await requestResetCode(ctx, tab, admin.email);
      const wrong = code === "AAAAAA" ? "BBBBBB" : "AAAAAA";
      await typeCode(tab, wrong);
      await ctx.verify("the wrong code does not open the new password form", [
        tab.visible({ role: "heading", name: "Reset your password" }, { hidden: true, timeoutMs: 5_000 }),
        tab.at(/^\/auth\/forgot-validation/),
      ]);
      const withOld = await login(ctx, "the old password still signs in", admin.email, admin.password);
      await ctx.verify("the password is unchanged", [ctx.status(withOld, 200)]);
    },
  },
  {
    id: "base-written-data-upgrade",
    title: "an owner, a session and a record written by the base version are read by this version (Format containment)",
    entryPoint: "the base ref's backend, then this one, on the same database",
    onboard: false,
    async run(/** @type {Ctx} */ ctx) {
      const admin = ctx.adminCredentials();
      const written = {};
      await ctx.withBaseBackend(async () => {
        const answer = await ctx.onboard({ platformName: "Written by the base version" });
        const created = await ctx.api("create a record with the base version", {
          method: "POST",
          path: "/api/user/new",
          body: { name: "Base Record", email: ctx.email("base-record"), avatar: "https://example.com/avatar.png" },
        });
        const session = await login(ctx, "sign in with the base version", admin.email, admin.password);
        Object.assign(written, { recordId: created.body?._id, access: session.body?.access_token, refresh: session.body?.refresh_token });
        await ctx.verify("the base version onboards, writes a record and opens a session", [
          ctx.equal("register", answer.register.status, 200),
          ctx.status(created, 200),
          ctx.holds("tokens issued", written.access && written.refresh, Object.keys(written).join(", ")),
        ]);
      });
      const me = await ctx.api("read the account with the base access token", { method: "GET", path: "/api/auth/me", token: written.access });
      const refreshed = await ctx.api("refresh the base session", { method: "POST", path: "/api/auth/refresh", as: "anon", body: { token: written.refresh } });
      const relogin = await login(ctx, "sign in with this version", admin.email, admin.password);
      const users = await ctx.api("read the base record", { method: "GET", path: "/api/user/list?limit=100" });
      await ctx.verify("this version reads what the base version wrote", [
        ctx.status(me, 200),
        ctx.equal("the account behind the base token", me.body?.email, admin.email),
        ctx.holds("the base refresh token refreshes", refreshed.status === 200 && refreshed.body?.access_token, refreshed.status),
        ctx.status(relogin, 200),
        ctx.holds("the record is listed", (users.body?.results ?? []).some((user) => user._id === written.recordId), written.recordId),
      ]);
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await ctx.verify("the owner signs in through the form", [tab.visible({ role: "button", name: "Verify Admin" })]);
    },
  },
];
