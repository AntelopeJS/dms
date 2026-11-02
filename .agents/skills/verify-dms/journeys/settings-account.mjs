import { PROFILE, SECURITY, NOTIFICATIONS, SHORTCUTS, SETTINGS, USER_API, ADMIN_NAME, me, login, secondDevice, typeCode, mailedCode, openPasswordForm, fillPasswordForm, openEmailForm, submitEmailForm } from "./settings-account/steps.mjs";
import { preferenceJourneys } from "./settings-account/preferences.mjs";
import { accessJourneys } from "./settings-account/access.mjs";
import { isMemberRow, listOf, stringIn } from "../rows.mjs";

/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

/** The personal settings pages: profile, security, language and region, notifications, appearance, shortcuts. */
export const journeys = [
  {
    id: "profile-name-persists",
    title: "editing the full name shows Profile saved and the new name everywhere it is read back",
    entryPoint: "Settings > Profile > Full name",
    async run(/** @type {Ctx} */ ctx) {
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
        ctx.equal("name", stringIn(account.body, "name"), "Verify Renamed"),
        ctx.equal("member names", listOf(members.body, isMemberRow).map((member) => member.name), ["Verify Renamed"]),
      ]);
      await tab.goto(SETTINGS);
      await ctx.verify("the settings overview reads the new name", [tab.shows(/Verify Renamed/)]);
    },
  },
  {
    id: "profile-name-required",
    title: "a blank full name is refused and nothing is saved, and Discard restores the stored name",
    entryPoint: "Settings > Profile > Full name > Save changes",
    async run(/** @type {Ctx} */ ctx) {
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
        ctx.equal("API name", stringIn(account.body, "name"), ADMIN_NAME),
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
    async run(/** @type {Ctx} */ ctx) {
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
        ctx.holds("new password accepted", withNew.status === 200 && stringIn(withNew.body, "access_token"), withNew.status),
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
    async run(/** @type {Ctx} */ ctx) {
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
    async run(/** @type {Ctx} */ ctx) {
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
        ctx.equal("email before the code", stringIn(pending.body, "email"), admin.email),
      ]);
      await typeCode(tab, code);
      await ctx.verify("the sixth character confirms and the page shows the new address as the sign-in email", [tab.shows(new RegExp(address.replace(/[+.]/g, "\\$&")))]);
      await tab.reload();
      const withNew = await login(ctx, "sign in with the new address", address, admin.password);
      const withOld = await login(ctx, "sign in with the old address", admin.email, admin.password);
      await ctx.verify("a reload, the API and the sign-in all use the new address only", [
        tab.shows(new RegExp(address.replace(/[+.]/g, "\\$&"))),
        ctx.holds("new address signs in", withNew.status === 200 && stringIn(withNew.body, "access_token"), withNew.status),
        ctx.status(withOld, 401),
      ]);
    },
  },
  {
    id: "change-email-errors",
    title: "a wrong password, a malformed address and a wrong code all leave the sign-in address unchanged",
    entryPoint: "Settings > Security > Change email, POST /dms/pages/settings/user/security/email/confirm",
    async run(/** @type {Ctx} */ ctx) {
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
        ctx.equal("email", stringIn(account.body, "email"), admin.email),
        ctx.status(withOld, 200),
        ctx.status(withNew, 401),
      ]);
    },
  },
  ...preferenceJourneys,
  ...accessJourneys,
  {
    id: "settings-overview-and-search",
    title: "the settings overview summarises the account and links every page, and the settings search filters the menu",
    entryPoint: "Settings (/settings), Search settings",
    async run(/** @type {Ctx} */ ctx) {
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
    async run(/** @type {Ctx} */ ctx) {
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
