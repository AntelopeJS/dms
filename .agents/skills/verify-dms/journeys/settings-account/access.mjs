import { readFileSync } from "node:fs";
import { PROFILE, SECURITY, SETTINGS, SIGNED_IN, ADMIN_NAME, TWO_FACTOR_CODE_WINDOW_MS, me, login, secondDevice, typeCode, mailedCode, joinMember } from "./steps.mjs";
import { isMemberRow, listOf, stringIn } from "../../rows.mjs";

/**
 * @typedef {import("../../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

/**
 * Whether a parsed JSON value is an object or an array, not a primitive or `null`.
 * @param {unknown} value
 * @returns {value is object}
 */
function isJsonObject(value) {
  return typeof value === "object" && value !== null;
}

/** The sessions, the second factor, the data export and the deletion of the account. */
export const accessJourneys = [
  {
    id: "sessions-sign-out",
    title: "signing out a listed session ends it, and Sign out other sessions makes every other token refused",
    entryPoint: "Settings > Security > Sessions",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      const other = await secondDevice(ctx);
      const apiToken = ctx.state.tokens.admin;
      await tab.goto(SECURITY);
      await ctx.verify("the list shows this device and the others", [
        tab.shows(/3 active/),
        tab.shows(/This device/),
      ]);
      await tab.click({ role: "button", name: /^Sign out Chrome Headless/ });
      await ctx.verify("that session leaves the list", [tab.shows(/2 active/)]);
      await other.goto(SECURITY);
      await ctx.verify("the signed-out browser is sent to sign-in", [other.at(/^\/auth/)]);
      const stillValid = await fetch(`${ctx.state.apiUrl}/api/auth/me`, { headers: { authorization: `Bearer ${apiToken}` } });
      await ctx.verify("the API session that was not signed out still works", [ctx.equal("status", stillValid.status, 200)]);
      await tab.click({ role: "button", name: "Sign out other sessions" });
      await tab.click({ role: "button", name: /^Sign out \d+ sessions?$/, within: { role: "dialog" } });
      await tab.reload();
      const revoked = await fetch(`${ctx.state.apiUrl}/api/auth/me`, { headers: { authorization: `Bearer ${apiToken}` } });
      await ctx.verify("only this device is left and the other token is refused", [
        tab.shows(/1 active/),
        ctx.equal("revoked token status", revoked.status, 401),
      ]);
      await tab.goto(SETTINGS);
      await ctx.verify("this device stays signed in", [tab.at(new RegExp(`^${SETTINGS}$`))]);
    },
  },
  {
    id: "two-factor-email-enroll",
    title: "adding email codes as a second factor shows backup codes, asks for a code at the next sign-in, and removing it restores plain sign-in",
    entryPoint: "Settings > Security > Two-factor authentication, /auth/2fa",
    async run(/** @type {Ctx} */ ctx) {
      const admin = ctx.adminCredentials();
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(SECURITY);
      await ctx.verify("two-factor starts off", [tab.shows(/Two-factor is off/)]);
      let since = new Date().toISOString();
      await tab.click({ role: "button", name: "Add method" });
      await tab.click({ role: "menuitem", name: "Email verification" });
      await tab.fill({ role: "textbox", name: "Current password" }, admin.password);
      await tab.click({ role: "button", name: "Continue" });
      const enrol = await mailedCode(ctx, admin.email, since, /verification code/i);
      await typeCode(tab, enrol.code);
      await ctx.verify("ten backup codes are shown once", [
        tab.visible({ role: "heading", name: "Your new backup codes" }),
        ctx.equal("backup codes listed", await tab.page.getByRole("dialog").getByRole("listitem").count(), 10),
      ]);
      await tab.click({ role: "button", name: "I've saved my codes" });
      await tab.reload();
      await ctx.verify("the page reports two-factor on with the backup codes counted", [
        tab.visible({ role: "heading", name: /Two-factor authentication On/ }),
        tab.shows(/10 of 10 left/),
      ]);
      since = new Date().toISOString();
      const device = await ctx.tab("device", "second device");
      await device.goto("/auth");
      await device.fill({ role: "textbox", name: "Email address" }, admin.email);
      await device.fill({ role: "textbox", name: "Password", exact: true }, admin.password);
      await device.click({ role: "button", name: "Login", exact: true });
      await ctx.verify("a new sign-in is stopped at the two-factor step", [
        device.visible({ role: "heading", name: "Two-factor verification" }),
        device.at(/^\/auth\/2fa/),
      ]);
      await device.click({ role: "button", name: "Send verification code by email" });
      const challenge = await mailedCode(ctx, admin.email, since, /verification code/i);
      await typeCode(device, challenge.code);
      await device.click({ role: "button", name: "Verify" });
      await ctx.verify("the emailed code completes the sign-in", [device.at(SIGNED_IN)]);
      await tab.goto(SECURITY);
      await tab.click({ role: "button", name: "Remove…" });
      await tab.page.waitForTimeout(TWO_FACTOR_CODE_WINDOW_MS);
      since = new Date().toISOString();
      await tab.click({ role: "button", name: "Send code by email" });
      const removal = await mailedCode(ctx, admin.email, since, /verification code/i);
      await typeCode(tab, removal.code);
      await tab.reload();
      await ctx.verify("removing the last method turns two-factor off", [tab.shows(/Two-factor is off/)]);
      const plain = await login(ctx, "sign in without a second factor", admin.email, admin.password);
      await ctx.verify("sign-in needs no second factor again", [ctx.holds("an access token is issued", stringIn(plain.body, "access_token"), plain.status)]);
    },
  },
  {
    id: "export-my-data",
    title: "Export my data downloads a JSON file with the profile and never the password",
    entryPoint: "Settings > Profile > Your data > Export my data",
    async run(/** @type {Ctx} */ ctx) {
      const admin = ctx.adminCredentials();
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(PROFILE);
      const download = tab.page.waitForEvent("download", { timeout: 15_000 });
      await tab.click({ role: "button", name: "Export my data" });
      const file = await download.then(async (entry) => entry.path(), () => null);
      await ctx.verify("a file is downloaded and the page confirms", [
        ctx.holds("a download started", file, "no download"),
        tab.shows(/Your data was downloaded/),
      ], { critical: true });
      const text = readFileSync(file, "utf8");
      /** @type {unknown} */
      const data = JSON.parse(text);
      await ctx.verify("the file holds the account and no secret", [
        ctx.holds("it names the email", text.includes(admin.email), "email missing"),
        ctx.holds("it names the full name", text.includes(ADMIN_NAME), "name missing"),
        ctx.holds("it is an object", isJsonObject(data), text.slice(0, 80)),
        ctx.holds("it leaves the password out", !text.includes(admin.password), "password present"),
      ]);
    },
  },
  {
    id: "delete-account-last-owner-refused",
    title: "the last owner is told the account cannot be deleted yet and keeps it",
    entryPoint: "Settings > Profile > Your data > Delete my account",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(PROFILE);
      await tab.click({ role: "button", name: "Delete my account" });
      await ctx.verify("the dialog explains who must take over first", [
        tab.visible({ role: "dialog", name: "Your account can't be deleted yet" }),
        tab.shows(/You're the last owner of/),
      ]);
      await tab.click({ role: "button", name: "Got it" });
      const account = await me(ctx, "the account after the refusal");
      await ctx.verify("the account still exists", [ctx.status(account, 200)]);
    },
  },
  {
    id: "delete-account-member",
    title: "a member who deletes their account is signed out, cannot sign in again, and leaves the Members list",
    entryPoint: "Settings > Profile > Your data > Delete my account",
    async run(/** @type {Ctx} */ ctx) {
      const leaver = await joinMember(ctx, "Quinn");
      await leaver.tab.goto(PROFILE);
      await leaver.tab.click({ role: "button", name: "Delete my account" });
      await ctx.verify("the dialog states what is removed and asks for confirmation", [
        leaver.tab.visible({ role: "dialog" }),
        leaver.tab.shows(/Delete my account|Delete your account/),
      ]);
      await ctx.verify("the dialog counts what the deletion takes away", [
        leaver.tab.shows(/Workspaces you leave\s*1/),
        leaver.tab.shows(/Devices signed out\s*1/),
      ]);
      await leaver.tab.fill({ role: "textbox", name: "Current password" }, leaver.password);
      await leaver.tab.click({ role: "button", name: "Delete permanently" });
      await ctx.verify("without the typed address the deletion is refused", [
        leaver.tab.shows(/This field is required/),
        leaver.tab.visible({ role: "dialog", name: "Delete your account?" }),
      ]);
      const stillThere = await login(ctx, "the account still signs in", leaver.email, leaver.password);
      await ctx.verify("nothing was deleted yet", [ctx.holds("still signs in", stringIn(stillThere.body, "access_token"), stillThere.status)]);
      await leaver.tab.fill({ role: "textbox", name: new RegExp(`^Type ${leaver.email.replace(/[+.]/g, "\\$&")} to confirm`) }, leaver.email);
      await leaver.tab.click({ role: "button", name: "Delete permanently" });
      await ctx.verify("the member lands on sign-in", [leaver.tab.at(/^\/auth/)]);
      const again = await login(ctx, "sign in after deleting", leaver.email, leaver.password);
      const members = await ctx.api("list the members", { method: "GET", path: "/api/tables/members/list" });
      await ctx.verify("the account can no longer sign in and the member is gone", [
        ctx.holds("no access token", !stringIn(again.body, "access_token"), JSON.stringify(again.body)?.slice(0, 120)),
        ctx.equal("members", listOf(members.body, isMemberRow).map((member) => member.email), [ctx.adminCredentials().email]),
      ]);
    },
  },
];
