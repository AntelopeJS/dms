import { REGION, NOTIFICATIONS, APPEARANCE, SETTINGS, USER_API, me, secondDevice, changePasswordThroughApi, tick, expandSystem, htmlHasClass } from "./steps.mjs";
import { booleanIn, numberIn, stringIn } from "../../rows.mjs";

/**
 * @typedef {import("../../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

export const preferenceJourneys = [
  {
    id: "language-region-persists",
    title: "choosing French switches the dashboard at once, survives a reload and shows on the account; a 24-hour clock persists too",
    entryPoint: "Settings > Language & region",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(REGION);
      await tab.click({ role: "combobox", name: "Application language" });
      await tab.click({ role: "option", name: "Français" });
      await ctx.verify("the page switches to French and says it saved", [
        tab.visible({ role: "heading", name: "Langue et région", exact: true }),
        tab.shows(/Enregistré/),
      ]);
      await tab.reload();
      await ctx.verify("a reload keeps French", [
        tab.visible({ role: "heading", name: "Langue et région", exact: true }),
        tab.visible({ role: "combobox", name: "Langue de l'application" }),
      ]);
      const account = await me(ctx, "read the account");
      const preferences = await ctx.api("read the regional preferences", { method: "GET", path: `${USER_API}/region/preferences` });
      await ctx.verify("the account and its preferences hold French", [
        ctx.equal("language", stringIn(account.body, "language"), "fr"),
        ctx.equal("preference language", stringIn(preferences.body, "language"), "fr"),
      ]);
      const other = await secondDevice(ctx);
      await other.goto(SETTINGS);
      await ctx.verify("another browser signed in as the account is in French too", [
        other.visible({ role: "heading", name: "Paramètres", exact: true }),
      ]);
      await tab.click({ role: "combobox", name: "Langue de l'application" });
      await tab.click({ role: "option", name: "English" });
      await ctx.verify("switching back restores English", [
        tab.visible({ role: "heading", name: "Language & region", exact: true }),
        ctx.equal("language", stringIn((await me(ctx, "read the account again")).body, "language"), "en"),
      ]);
    },
  },
  {
    id: "time-format-persists",
    title: "a 24-hour clock changes the preview at once and is stored on the account",
    entryPoint: "Settings > Language & region > Time format",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(REGION);
      await tab.click({ role: "radio", name: "24-hour" });
      await ctx.verify("the preview drops AM and PM", [tab.shows(/Time\s+\d{2}:\d{2}/i), tab.shows(/\d{2}:\d{2} (AM|PM)/, { not: true })]);
      await tab.reload();
      const preferences = await ctx.api("read the regional preferences", { method: "GET", path: `${USER_API}/region/preferences` });
      await ctx.verify("a reload and the API keep the 24-hour clock", [
        ctx.equal("checked", await tab.page.getByRole("radio", { name: "24-hour" }).isChecked(), true),
        ctx.equal("timeFormat", stringIn(preferences.body, "timeFormat"), "h23"),
      ]);
    },
  },
  {
    id: "appearance-persists",
    title: "dark theme, large density and the accessibility switches apply at once, survive a reload and stay on this browser",
    entryPoint: "Settings > Appearance",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(APPEARANCE);
      await ctx.verify("the default is the system theme, light here", [
        tab.enabled({ role: "radio", name: /^System/ }),
        ctx.equal("dark class", await htmlHasClass(tab, "dark"), false),
      ]);
      await tick(tab, "radio", /^Dark/);
      await tick(tab, "radio", /^Large/);
      await tick(tab, "switch", "Increase contrast");
      await ctx.verify("the page applies the choices at once", [
        ctx.holds("dark class set", await htmlHasClass(tab, "dark"), "html has no dark class"),
        tab.shows(/Saved instantly/),
      ]);
      await tab.reload();
      await ctx.verify("a reload keeps theme, density and contrast", [
        ctx.holds("dark class kept", await htmlHasClass(tab, "dark"), "html has no dark class"),
        ctx.equal("Dark checked", await tab.page.getByRole("radio", { name: /^Dark/ }).isChecked(), true),
        ctx.equal("Large checked", await tab.page.getByRole("radio", { name: /^Large/ }).isChecked(), true),
        ctx.equal("contrast on", await tab.page.getByRole("switch", { name: "Increase contrast" }).isChecked(), true),
      ]);
      await tab.goto(SETTINGS);
      await ctx.verify("the choice follows the person to other pages", [ctx.holds("dark class kept", await htmlHasClass(tab, "dark"), "html has no dark class")]);
      const other = await secondDevice(ctx);
      await other.goto(APPEARANCE);
      await ctx.verify("another browser keeps its own choice: still the light default", [
        ctx.equal("dark class", await htmlHasClass(other, "dark"), false),
        ctx.equal("Dark checked", await other.page.getByRole("radio", { name: /^Dark/ }).isChecked(), false),
      ]);
    },
  },
  {
    id: "notification-preferences-persist",
    title: "turning Security alerts off persists across a reload and stops the Password changed alert while it is off",
    entryPoint: "Settings > Notifications > Preferences",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(NOTIFICATIONS);
      await expandSystem(tab);
      await ctx.verify("every System subject is on by default and General cannot be switched off", [
        tab.shows(/5 of 5 on/),
        tab.enabled({ role: "switch", name: "General" }, { disabled: true }),
      ]);
      await tab.click({ role: "switch", name: "Security alerts" });
      await ctx.verify("the table saves the switch on its own", [tab.shows(/4 of 5 on/)]);
      await tab.reload();
      await expandSystem(tab);
      const stored = await ctx.api("read the preferences", { method: "GET", path: `${USER_API}/notifications/preferences` });
      await ctx.verify("a reload and the API keep Security alerts off", [
        tab.shows(/4 of 5 on/),
        ctx.equal("system:security", booleanIn(stored.body, "system:security"), false),
        ctx.equal("system:general", booleanIn(stored.body, "system:general"), true),
      ]);
      const allCount = async (/** @type {string} */ label) => numberIn((await ctx.api(label, { method: "GET", path: `${USER_API}/notifications/counts` })).body, "all");
      const before = await allCount("count the notifications");
      await changePasswordThroughApi(ctx);
      const whileOff = await allCount("count the notifications after a password change with alerts off");
      await ctx.verify("a password change raises no alert while Security alerts is off", [ctx.equal("all", whileOff, before)]);
      await tab.signIn("admin");
      await tab.goto(NOTIFICATIONS);
      await expandSystem(tab);
      await tab.click({ role: "switch", name: "Security alerts" });
      await ctx.verify("switching it back on is saved", [tab.shows(/5 of 5 on/)]);
      await changePasswordThroughApi(ctx);
      const whileOn = await allCount("count the notifications after a password change with alerts on");
      await ctx.verify("with Security alerts on, the same change raises one alert", [ctx.equal("all", whileOn, (before ?? 0) + 1)]);
    },
  },
  {
    id: "notification-inbox-actions",
    title: "Mark all as read and Delete all change the inbox and the counts, and the state survives a reload",
    entryPoint: "Settings > Notifications > Inbox",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await secondDevice(ctx);
      await tab.goto(NOTIFICATIONS);
      await ctx.verify("the inbox lists unread alerts", [
        tab.visible({ role: "button", name: /^Unread [1-9]/ }),
        tab.shows(/New sign-in from/),
      ]);
      await tab.click({ role: "button", name: "Mark all as read" });
      await ctx.verify("every notification is read", [tab.visible({ role: "button", name: "Unread 0" })]);
      await tab.reload();
      await ctx.verify("a reload keeps them read but listed", [
        tab.visible({ role: "button", name: "Unread 0" }),
        tab.shows(/New sign-in from/),
      ]);
      await tab.click({ role: "button", name: "Delete all…" });
      await ctx.verify("the dialog asks before deleting", [tab.visible({ role: "dialog" })]);
      await tab.click({ role: "button", name: /^Delete/, within: { role: "dialog" } });
      await tab.reload();
      /** @type {unknown} */
      const counts = (await ctx.api("count the notifications", { method: "GET", path: `${USER_API}/notifications/counts` })).body;
      await ctx.verify("the inbox is empty after a reload", [
        tab.shows(/New sign-in from/, { not: true }),
        tab.visible({ role: "button", name: "All 0" }),
        ctx.holds("counts are zero", JSON.stringify(counts).match(/[1-9]/) === null, JSON.stringify(counts)),
      ]);
    },
  },
];
