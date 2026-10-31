/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("../../../../packages/dms/bin/control/tab.mjs").Tab} Tab
 * @typedef {import("./rows.mjs").UserRow} UserRow
 */

const USERS = "/table-view/table-view-users";
const USERS_API = "/api/user";

async function signedIn(/** @type {Ctx} */ ctx, /** @type {string} */ label = "admin") {
  const tab = await ctx.tab("admin", label);
  await tab.signIn("admin");
  return tab;
}

/**
 * @param {Ctx} ctx
 * @param {string} label
 * @returns {Promise<UserRow[]>}
 */
async function listUsers(ctx, label) {
  const answer = await ctx.api(label, { method: "GET", path: `${USERS_API}/list?limit=100` });
  return answer.body?.results ?? [];
}

async function createUser(/** @type {Tab} */ tab, /** @type {string} */ name, /** @type {string} */ email) {
  await tab.goto(USERS);
  await tab.click({ role: "button", name: "New entry" });
  await tab.fill({ role: "textbox", name: "Name" }, name);
  await tab.fill({ role: "textbox", name: "Email" }, email);
  await tab.fill({ role: "textbox", name: "Avatar" }, "https://example.com/avatar.png");
  await tab.click({ role: "button", name: "Create" });
}

async function search(/** @type {Tab} */ tab, /** @type {string} */ text) {
  await tab.click({ role: "button", name: "Open search" });
  await tab.fill({ role: "textbox", name: "Search" }, text);
}

/** A module's pages: a table view with its form, row actions, search, realtime updates and a missing record. */
export const journeys = [
  {
    id: "table-create-record",
    title: "New entry creates a user that the table lists, and it survives a reload and a backend restart",
    entryPoint: "/table-view/table-view-users > New entry",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      const name = ctx.unique("Verify User");
      const email = ctx.email("table-user");
      await createUser(tab, name, email);
      await tab.goto(USERS);
      await search(tab, name);
      await ctx.verify("the table lists the new user", [tab.visible({ role: "cell", name })]);
      await ctx.restartBackend();
      await tab.reload();
      await search(tab, name);
      await ctx.verify("the user is still listed after a backend restart", [tab.visible({ role: "cell", name })]);
      const users = await listUsers(ctx, "read the users");
      await ctx.verify("the data API holds the user", [
        ctx.holds("one row with the name and email", users.filter((user) => user.name === name && user.email === email).length === 1, JSON.stringify(users.filter((user) => user.name === name))),
      ]);
    },
  },
  {
    id: "form-required-fields",
    title: "Create with empty required fields names them and stores nothing",
    entryPoint: "/table-view/table-view-users/table/new",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      const before = await listUsers(ctx, "count the users before");
      await tab.goto(USERS);
      await tab.click({ role: "button", name: "New entry" });
      await tab.click({ role: "button", name: "Create" });
      await ctx.verify("the form lists the fields that need attention", [
        tab.shows(/fields? needs? your attention/),
        tab.shows(/This field is required/),
        tab.at(/\/table\/new$/),
      ]);
      const after = await listUsers(ctx, "count the users after");
      await ctx.verify("no user was stored", [ctx.equal("user count", after.length, before.length)]);
    },
  },
  {
    id: "table-search-empty",
    title: "a search that matches no user shows the empty table, and clearing it lists them again",
    entryPoint: "/table-view/table-view-users search",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      await tab.goto(USERS);
      await search(tab, "qqxzjjwv");
      await ctx.verify("no row matches", [tab.visible({ role: "cell", name: "Ada Lovelace" }, { hidden: true })]);
      await tab.fill({ role: "textbox", name: "Search" }, "");
      await ctx.verify("clearing the search lists the users again", [tab.visible({ role: "cell", name: "Ada Lovelace" })]);
    },
  },
  {
    id: "table-edit-record",
    title: "Edit from the row menu renames a user, and the new name persists",
    entryPoint: "row menu > Edit",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      const renamed = ctx.unique("Ada Renamed");
      await tab.goto(USERS);
      await tab.click({ role: "button", name: "Actions for Ada Lovelace" });
      await tab.click({ role: "menuitem", name: "Edit" });
      await tab.fill({ role: "textbox", name: "Name" }, renamed);
      await tab.click({ role: "button", name: /^(Save|Update)/ });
      await tab.goto(USERS);
      await ctx.verify("the table shows the new name", [
        tab.visible({ role: "cell", name: renamed }),
        tab.visible({ role: "cell", name: "Ada Lovelace" }, { hidden: true }),
      ]);
      const users = await listUsers(ctx, "read the renamed user");
      await ctx.verify("the data API holds the new name", [
        ctx.equal("user 1", users.find((user) => user._id === "1")?.name, renamed),
      ]);
    },
  },
  {
    id: "table-delete-record",
    title: "Delete from the row menu asks to confirm, then the user is gone from the table and the API",
    entryPoint: "row menu > Delete",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      await tab.goto(USERS);
      await tab.click({ role: "button", name: "Actions for Grace Hopper" });
      await tab.click({ role: "menuitem", name: "Delete" });
      await ctx.verify("a confirmation is asked first", [tab.visible({ role: "dialog", name: "Delete this item?" })]);
      await tab.click({ role: "button", name: "Delete", exact: true, within: { role: "dialog", name: "Delete this item?" } });
      await tab.reload();
      await ctx.verify("the row is gone after a reload", [tab.visible({ role: "cell", name: "Grace Hopper" }, { hidden: true })]);
      const users = await listUsers(ctx, "read the users after the delete");
      await ctx.verify("the data API no longer has the user", [
        ctx.holds("Grace Hopper is gone", !users.some((user) => user.name === "Grace Hopper"), users.map((user) => user.name).join(", ")),
      ]);
    },
  },
  {
    id: "realtime-row-reaches-other-tab",
    title: "a user created in one tab appears in another tab on the same table without a reload",
    entryPoint: "realtime: /api/realtime/connection shared by the tabs of a browser",
    async run(/** @type {Ctx} */ ctx) {
      const watcher = await signedIn(ctx, "watcher");
      await watcher.goto(USERS);
      const writer = await ctx.tab("admin", "writer");
      const name = ctx.unique("Realtime User");
      await createUser(writer, name, ctx.email("realtime-user"));
      await ctx.verify("the watching tab shows the new row without reloading", [
        watcher.visible({ role: "cell", name }, { timeoutMs: 20_000 }),
      ]);
    },
  },
  {
    id: "record-not-found",
    title: "the edit page of a record that does not exist says so instead of an empty form",
    entryPoint: "/table-view/table-view-users/table/<missing id>/edit",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      await tab.goto(`${USERS}/table/verify-missing-record/edit`);
      await ctx.verify("the page reports the missing record", [
        tab.visible({ role: "status" }),
        tab.shows(/This entry does not exist, or no longer does/),
        tab.visible({ role: "button", name: /^(Save|Update)/ }, { hidden: true, timeoutMs: 5_000 }),
      ]);
    },
  },
];
