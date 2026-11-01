import { readFileSync } from "node:fs";
import { PROFILE, SECURITY, NOTIFICATIONS, SHORTCUTS, SETTINGS, USER_API, SIGNED_IN, ADMIN_NAME, TWO_FACTOR_CODE_WINDOW_MS, me, login, secondDevice, typeCode, mailedCode, openPasswordForm, fillPasswordForm, openEmailForm, submitEmailForm, joinMember } from "./settings-account/steps.mjs";
import { preferenceJourneys } from "./settings-account/preferences.mjs";

/**
 * Whether a parsed JSON value is an object or an array, not a primitive or `null`.
 * @param {unknown} value
 * @returns {value is object}
 */
function isJsonObject(value) {
  return typeof value === "object" && value !== null;
}

/** The personal settings pages: profile, security, language and region, notifications, appearance, shortcuts. */
export const journeys = [
  {
    id: "profile-name-persists",
    title: "editing the full name shows Profile saved and the new name everywhere it is read back",
    entryPoint: "Settings > Profile > Full name",
    async run(ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(PROFILE);
      await ctx.verify("the profile shows the current name and a read-only email", [
        ctx.equal("name", await tab.value({ role: "textbox", name: "Full name" }), ADMIN_NAME),
        ctx.equal("email is editable", await tab.page.getByRole("textbox", { name: "Email (read only)" }).isEditable(), false),
      ]);
      await tab.fill({ role: "textbox", name: "Full name" }, "Verify Renamed");
      await ctx.verify("the page offers to save and names the previous value", [
        tab.shows(/Unsaved changes/),
        tab.shows(/Was “Verify Admin”/),
      ]);
      await tab.click({ role: "button", name: "Save changes" });
      await ctx.verify("the profile is saved", [tab.shows(/Profile saved/)]);
      await tab.reload();
      await ctx.verify("a reload shows the new name in the form and in the account menu", [
        ctx.equal("name", await tab.value({ role: "textbox", name: "Full name" }), "Verify Renamed"),
        tab.visible({ role: "button", name: /Verify Renamed/ }),
      ]);
      const account = await me(ctx, "read the account");
      const members = await ctx.api("list the members", { method: "GET", path: "/api/tables/members/list" });
      await ctx.verify("the API and the members list hold the new name", [
        ctx.equal("name", account.body?.name, "Verify Renamed"),
        ctx.equal("member names", members.body?.results?.map((member) => member.name), ["Verify Renamed"]),
      ]);
      await tab.goto(SETTINGS);
      await ctx.verify("the settings overview reads the new name", [tab.shows(/Verify Renamed/)]);
    },
  },
  {
    id: "profile-name-required",
    title: "a blank full name is refused and nothing is saved, and Discard restores the stored name",
    entryPoint: "Settings > Profile > Full name > Save changes",
    async run(ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(PROFILE);
      await tab.fill({ role: "textbox", name: "Full name" }, "");
      await tab.click({ role: "button", name: "Save changes" });
      await ctx.verify("the form asks for a name and does not confirm a save", [
        tab.shows(/This field is required\./),
        tab.shows(/Profile saved/, { not: true, timeoutMs: 1_500 }),
      ]);
      await tab.reload();
      const account = await me(ctx, "read the account");
      await ctx.verify("the stored name is unchanged", [
        ctx.equal("name", await tab.value({ role: "textbox", name: "Full name" }), ADMIN_NAME),
        ctx.equal("API name", account.body?.name, ADMIN_NAME),
      ]);
      await tab.fill({ role: "textbox", name: "Full name" }, "Typed then discarded");
      await tab.click({ role: "button", name: "Discard" });
      await ctx.verify("Discard puts the stored name back", [
        ctx.equal("name", await tab.value({ role: "textbox", name: "Full name" }), ADMIN_NAME),
      ]);
    },
  },
  {
    id: "change-password-signs-out-other-devices",
    title: "a new password signs in, the old one is refused, and the account's other sessions are signed out",
    entryPoint: "Settings > Security > Change password",
    async run(ctx) {
      const admin = ctx.adminCredentials();
      const fresh = ctx.password();
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      const other = await secondDevice(ctx);
      await openPasswordForm(tab);
      await fillPasswordForm(tab, { current: admin.password, next: fresh });
      await ctx.verify("the form shows every rule met and offers to update", [
        tab.shows(/5 of 5 met/),
        tab.visible({ role: "button", name: "Update password" }),
      ]);
      await tab.click({ role: "button", name: "Update password" });
      await ctx.verify("the page confirms and says other sessions were signed out", [
        tab.shows(/Password updated/),
        tab.shows(/other sessions? signed out/),
      ]);
      await tab.reload();
      await ctx.verify("this device stays signed in and the page says the password changed today", [
        tab.at(new RegExp(`^${SECURITY}$`)),
        tab.shows(/Changed today/),
      ]);
      await other.goto(SECURITY);
      await ctx.verify("the other device is sent back to sign-in", [other.at(/^\/auth/)]);
      const withNew = await login(ctx, "sign in with the new password", admin.email, fresh);
      const withOld = await login(ctx, "sign in with the old password", admin.email, admin.password);
      await ctx.verify("only the new password signs in", [
        ctx.holds("new password accepted", withNew.status === 200 && withNew.body?.access_token, withNew.status),
        ctx.status(withOld, 401),
      ]);
      ctx.addAccount("admin", { ...ctx.state.accounts.admin, password: fresh });
      await tab.goto(NOTIFICATIONS);
      await ctx.verify("a Password changed alert is in the inbox", [tab.shows(/Password changed/)]);
    },
  },
  {
    id: "change-password-errors",
    title: "a wrong current password, a weak new password and a mismatched confirmation are all refused and the password stays",
    entryPoint: "Settings > Security > Change password, POST /dms/pages/settings/user/security/password",
    async run(ctx) {
      const admin = ctx.adminCredentials();
      const fresh = ctx.password();
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openPasswordForm(tab);
      await fillPasswordForm(tab, { current: `${admin.password}x`, next: fresh });
      await tab.click({ role: "button", name: "Update password" });
      await ctx.verify("a wrong current password is named as incorrect", [tab.shows(/Your current password is incorrect/)]);
      await fillPasswordForm(tab, { current: admin.password, next: "weak" });
      await tab.click({ role: "button", name: "Update password" });
      await ctx.verify("a weak new password shows its unmet rules and is not saved", [
        tab.shows(/At least 8 characters\s+not met/),
        tab.shows(/Password updated/, { not: true, timeoutMs: 1_500 }),
      ]);
      await fillPasswordForm(tab, { current: admin.password, next: fresh, confirm: `${fresh}z` });
      await tab.click({ role: "button", name: "Update password" });
      await ctx.verify("a mismatched confirmation is not saved", [tab.shows(/Password updated/, { not: true, timeoutMs: 1_500 })]);
      const weak = await ctx.api("change the password to a weak one through the API", {
        method: "POST",
        path: `${USER_API}/security/password`,
        body: { currentPassword: admin.password, password: "weak" },
      });
      const stillOld = await login(ctx, "the old password still signs in", admin.email, admin.password);
      const never = await login(ctx, "the attempted password does not sign in", admin.email, fresh);
      await ctx.verify("the API refuses the weak password and the account keeps its password", [
        ctx.holds("weak password answers 4xx", weak.status >= 400 && weak.status < 500, weak.status),
        ctx.status(stillOld, 200),
        ctx.status(never, 401),
      ]);
    },
  },
  {
    id: "change-email-confirms-with-code",
    title: "a new sign-in address takes effect only after the code emailed to it is entered, and the old address is told",
    entryPoint: "Settings > Security > Change email, mail sink",
    async run(ctx) {
      const admin = ctx.adminCredentials();
      const address = ctx.email("renamed");
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      const since = new Date().toISOString();
      await openEmailForm(tab);
      await submitEmailForm(tab, { address, password: admin.password });
      await ctx.verify("the page asks for the emailed code and keeps the current address meanwhile", [
        tab.visible({ role: "heading", name: "Confirm your new email" }),
        tab.shows(new RegExp(`sent to ${address.replace(/[+.]/g, "\\$&")}`)),
      ]);
      const pending = await me(ctx, "the account before confirming");
      const { code } = await mailedCode(ctx, address, since, /Confirm your new sign-in email/);
      const warning = await ctx.mail(
        (message) => message.to.some((to) => to.includes(admin.email)) && /is being changed/.test(message.subject) && message.receivedAt > since,
      );
      await ctx.verify("the old address is warned and the account still uses it", [
        ctx.holds("a warning reached the old address", warning.match, warning.messages.map((message) => message.subject).join(" | ")),
        ctx.equal("email before the code", pending.body?.email, admin.email),
      ]);
      await typeCode(tab, code);
      await ctx.verify("the sixth character confirms and the page shows the new address as the sign-in email", [tab.shows(new RegExp(address.replace(/[+.]/g, "\\$&")))]);
      await tab.reload();
      const withNew = await login(ctx, "sign in with the new address", address, admin.password);
      const withOld = await login(ctx, "sign in with the old address", admin.email, admin.password);
      await ctx.verify("a reload, the API and the sign-in all use the new address only", [
        tab.shows(new RegExp(address.replace(/[+.]/g, "\\$&"))),
        ctx.holds("new address signs in", withNew.status === 200 && withNew.body?.access_token, withNew.status),
        ctx.status(withOld, 401),
      ]);
    },
  },
  {
    id: "change-email-errors",
    title: "a wrong password, a malformed address and a wrong code all leave the sign-in address unchanged",
    entryPoint: "Settings > Security > Change email, POST /dms/pages/settings/user/security/email/confirm",
    async run(ctx) {
      const admin = ctx.adminCredentials();
      const address = ctx.email("never");
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await openEmailForm(tab);
      await submitEmailForm(tab, { address, password: `${admin.password}x` });
      await ctx.verify("a wrong password is refused and no code is asked for", [
        tab.shows(/current password is incorrect/i),
        tab.visible({ role: "heading", name: "Confirm your new email" }, { hidden: true, timeoutMs: 2_000 }),
      ]);
      await submitEmailForm(tab, { address: "not-an-address", password: admin.password });
      await ctx.verify("a malformed address is refused", [
        tab.visible({ role: "heading", name: "Confirm your new email" }, { hidden: true, timeoutMs: 2_000 }),
        tab.shows(/valid email|isn’t valid|not a valid/i),
      ]);
      await submitEmailForm(tab, { address, password: admin.password });
      await tab.visible({ role: "heading", name: "Confirm your new email" });
      await typeCode(tab, "000000");
      await ctx.verify("a wrong code is named invalid and the dialog stays open", [
        tab.shows(/The validation code is invalid/),
        tab.visible({ role: "heading", name: "Confirm your new email" }),
      ]);
      const account = await me(ctx, "the account after the wrong code");
      const withOld = await login(ctx, "the old address still signs in", admin.email, admin.password);
      const withNew = await login(ctx, "the new address does not sign in", address, admin.password);
      await ctx.verify("the address is unchanged", [
        ctx.equal("email", account.body?.email, admin.email),
        ctx.status(withOld, 200),
        ctx.status(withNew, 401),
      ]);
    },
  },
  ...preferenceJourneys,
  {
    id: "sessions-sign-out",
    title: "signing out a listed session ends it, and Sign out other sessions makes every other token refused",
    entryPoint: "Settings > Security > Sessions",
    async run(ctx) {
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
    async run(ctx) {
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
      await ctx.verify("sign-in needs no second factor again", [ctx.holds("an access token is issued", plain.body?.access_token, plain.status)]);
    },
  },
  {
    id: "export-my-data",
    title: "Export my data downloads a JSON file with the profile and never the password",
    entryPoint: "Settings > Profile > Your data > Export my data",
    async run(ctx) {
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
      const data = JSON.parse(text);
      await ctx.verify("the file holds the account and no secret", [
        ctx.holds("it names the email", text.includes(admin.email), "email missing"),
        ctx.holds("it names the full name", text.includes(ADMIN_NAME), "name missing"),
        ctx.holds("it is an object", isJsonObject(data), typeof data),
        ctx.holds("it leaves the password out", !text.includes(admin.password), "password present"),
      ]);
    },
  },
  {
    id: "delete-account-last-owner-refused",
    title: "the last owner is told the account cannot be deleted yet and keeps it",
    entryPoint: "Settings > Profile > Your data > Delete my account",
    async run(ctx) {
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
    async run(ctx) {
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
      await ctx.verify("nothing was deleted yet", [ctx.holds("still signs in", stillThere.body?.access_token, stillThere.status)]);
      await leaver.tab.fill({ role: "textbox", name: new RegExp(`^Type ${leaver.email.replace(/[+.]/g, "\\$&")} to confirm`) }, leaver.email);
      await leaver.tab.click({ role: "button", name: "Delete permanently" });
      await ctx.verify("the member lands on sign-in", [leaver.tab.at(/^\/auth/)]);
      const again = await login(ctx, "sign in after deleting", leaver.email, leaver.password);
      const members = await ctx.api("list the members", { method: "GET", path: "/api/tables/members/list" });
      await ctx.verify("the account can no longer sign in and the member is gone", [
        ctx.holds("no access token", !again.body?.access_token, JSON.stringify(again.body)?.slice(0, 120)),
        ctx.equal("members", members.body?.results?.map((member) => member.email), [ctx.adminCredentials().email]),
      ]);
    },
  },
  {
    id: "settings-overview-and-search",
    title: "the settings overview summarises the account and links every page, and the settings search filters the menu",
    entryPoint: "Settings (/settings), Search settings",
    async run(ctx) {
      const admin = ctx.adminCredentials();
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(SETTINGS);
      await ctx.verify("the overview summarises the account", [
        tab.shows(new RegExp(ADMIN_NAME)),
        tab.shows(new RegExp(admin.email.replace(/[+.]/g, "\\$&"))),
        tab.shows(/Owner/),
        tab.shows(/recent account activity/i),
        tab.shows(/joined default/i),
      ]);
      await ctx.verify("it links every account and workspace page", [
        tab.visible({ role: "link", name: /^Profile/ }),
        tab.visible({ role: "link", name: /^Language & region/ }),
        tab.visible({ role: "link", name: /^Security/ }),
        tab.visible({ role: "link", name: /^Notifications/ }),
        tab.visible({ role: "link", name: /^Appearance/ }),
        tab.visible({ role: "link", name: /^Shortcuts/ }),
        tab.visible({ role: "link", name: /^Members/ }),
        tab.visible({ role: "link", name: /^Roles/ }),
      ]);
      await tab.fill({ role: "textbox", name: "Search settings" }, "secur");
      await ctx.verify("the search keeps the matching page only", [
        tab.visible({ role: "link", name: /^Security/, within: { role: "navigation", name: "Settings" } }),
        tab.visible({ role: "link", name: "Profile", within: { role: "navigation", name: "Settings" } }, { hidden: true, timeoutMs: 3_000 }),
      ]);
      await tab.fill({ role: "textbox", name: "Search settings" }, "zzzz");
      await ctx.verify("a search without a match says so", [tab.shows(/No settings match your search\./)]);
    },
  },
  {
    id: "shortcuts-layout-and-search",
    title: "the keyboard layout switches the key labels, and the shortcut search filters or says nothing matches",
    entryPoint: "Settings > Shortcuts",
    async run(ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(SHORTCUTS);
      await ctx.verify("the Windows & Linux layout is detected here", [
        tab.shows(/Open command palette\s+Ctrl\s*K/i),
        ctx.equal("checked", await tab.page.getByRole("radio", { name: "Windows & Linux" }).isChecked(), true),
      ]);
      await tab.click({ role: "radio", name: "macOS" });
      await ctx.verify("choosing macOS relabels the keys", [tab.shows(/Open command palette\s+⌘\s*K/), tab.shows(/Open command palette\s+Ctrl\s*K/i, { not: true })]);
      await tab.fill({ role: "textbox", name: /^Search shortcuts/ }, "palette");
      await ctx.verify("a search keeps the matching shortcut only", [
        tab.shows(/Open command palette/),
        tab.shows(/Refresh table data/, { not: true }),
      ]);
      await tab.fill({ role: "textbox", name: /^Search shortcuts/ }, "zzzz");
      await ctx.verify("a search without a match says so", [tab.shows(/No shortcut matches your search\./)]);
    },
  },
];
