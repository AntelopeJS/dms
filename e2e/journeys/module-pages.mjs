import { randomBytes } from "node:crypto";
import { fieldOf, itemsOf, parseJson, textOf, toolText, withBridge } from "../mcp-bridge.mjs";
import { isAgendaEventRow, isMatrixRow, isUserRow, listIn, listOf, numberIn } from "../rows.mjs";
import { operation, rebuild } from "./builder.mjs";

/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 * @typedef {import("@antelopejs/dms/e2e").Tab} Tab
 * @typedef {import("../rows.mjs").UserRow} UserRow
 * @typedef {import("../rows.mjs").AgendaEventRow} AgendaEventRow
 */

const USERS = "/table-view/table-view-users";
const USERS_API = "/api/user";
const MATRIX_ALLOCATION = "/matrix/matrix-allocation";
const MATRIX_CORRECTION_API = "/api/playground/matrix/allocation/correction/rows";
const MATRIX_CORRECTION_GRID = { role: "grid", name: "Correction de stock (avant / après)" };
const MATRIX_CELL = { role: "gridcell", name: "NE1 · 38", within: MATRIX_CORRECTION_GRID };
const AGENDA_BOOKINGS = "/agenda/agenda-bookings";
const AGENDA_BOOKINGS_EVENTS = "/api/playground/agenda/bookings/events";
const DAY_MS = 86_400_000;

/**
 * The bookings the Room bookings route answers from yesterday to four weeks ahead, the days its proposal looks in.
 *
 * @param {Ctx} ctx
 * @param {string} label
 * @returns {Promise<AgendaEventRow[]>}
 */
async function bookingsAhead(ctx, label) {
  const day = (/** @type {number} */ offset) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);
  const answer = await ctx.api(label, { method: "GET", path: `${AGENDA_BOOKINGS_EVENTS}?from=${day(-1)}&to=${day(28)}` });
  return listIn(answer.body, "events", isAgendaEventRow);
}

/**
 * The stock count of size 38 at Namur Esplanade the correction grid's route holds.
 *
 * @param {Ctx} ctx
 * @param {string} label
 * @returns {Promise<number | undefined>}
 */
async function countedAtNamur(ctx, label) {
  const answer = await ctx.api(label, { method: "GET", path: MATRIX_CORRECTION_API });
  const row = listIn(answer.body, "rows", isMatrixRow).find((entry) => entry.id === "NE1");
  return row ? numberIn(row.values, "38") : undefined;
}

/**
 * Whether the Matrix cell shows `text`, waiting for the grid to draw it.
 *
 * @param {Ctx} ctx
 * @param {Tab} tab
 * @param {string} text
 */
async function matrixCellShows(ctx, tab, text) {
  const cell = tab.page
    .getByRole("grid", { name: MATRIX_CORRECTION_GRID.name })
    .getByRole("gridcell", { name: MATRIX_CELL.name });
  const shown = await cell
    .filter({ hasText: text })
    .waitFor({ timeout: 15_000 })
    .then(() => true, () => false);
  return ctx.holds(`the cell reads ${text}`, shown, (await cell.innerText().catch(() => "")).trim());
}

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
  return listOf(answer.body, isUserRow);
}

async function createUser(/** @type {Tab} */ tab, /** @type {string} */ name, /** @type {string} */ email) {
  await tab.goto(USERS);
  await tab.click({ role: "button", name: "New entry" });
  await tab.fill({ role: "textbox", name: "Name" }, name);
  await tab.fill({ role: "textbox", name: "Email" }, email);
  await tab.fill({ role: "textbox", name: "Avatar" }, "https://example.com/avatar.png");
  await tab.click({ role: "button", name: "Create" });
}

/** An owner-only route of dms-assistant: the playground answers it 404, which still shows the request left the browser. */
const OWNER_ONLY_ROUTE = "/api/builder/database/connections/check";
const DIALOG_MOCKUP = "export-review";
const DIALOG_PAGE = "review";
const ROTATE_BUTTON = "Rotate…";
const ROTATE_CONFIRM = "Rotate";
/** The route answering a fixture of the journey's mockup. */
const fixtureRoute = (/** @type {string} */ key) => `/api/mockup/${DIALOG_MOCKUP}/pages/${DIALOG_PAGE}/fixtures/${key}`;
/**
 * The dialogs an agent stores as mockup fixtures. `component` draws a secret input rotating through a POST to an
 * owner-only route as its body, next to a plain text field; `field` draws a secret field rotating there.
 */
const DIALOGS = {
  component: {
    title: "Approve the export?",
    description: "Add a note for the reviewer.",
    component: { componentName: "dms-input-secret", options: { rotateUrl: `${OWNER_ONLY_ROUTE}?via=component` } },
    fields: [{ id: "note", label: "Note", type: "string", component: { componentName: "dms-input-text", options: {} } }],
  },
  field: {
    title: "Renew the export token?",
    fields: [
      {
        id: "token",
        label: "Export token",
        type: "secret",
        defaultValue: "sk_live_0000",
        component: { componentName: "dms-input-secret", options: { rotateUrl: `${OWNER_ONLY_ROUTE}?via=field` } },
      },
    ],
  },
};

/**
 * Presses each Rotate button the open dialog draws, then Rotate in the confirmation it opens, which stays open on the
 * route's 404 until Escape closes it.
 *
 * @param {Tab} tab
 * @returns {Promise<number>} How many Rotate buttons the dialog drew
 */
async function rotateEach(tab) {
  const buttons = tab.page.getByRole("dialog").first().getByRole("button", { name: ROTATE_BUTTON, exact: true });
  const count = await buttons.count();
  for (let index = 0; index < count; index += 1) {
    await buttons.nth(index).click();
    await tab.page.getByRole("dialog").last().getByRole("button", { name: ROTATE_CONFIRM, exact: true }).click({ timeout: 5_000 });
    await tab.page.waitForTimeout(1_500);
    await tab.page.keyboard.press("Escape");
    await tab.page.waitForTimeout(500);
  }
  return count;
}

async function search(/** @type {Tab} */ tab, /** @type {string} */ text) {
  await tab.click({ role: "button", name: "Open search" });
  await tab.fill({ role: "textbox", name: "Search" }, text);
}

/** A module's pages: a table view with its form, row actions, search, realtime updates and a missing record. */
export const journeys = [
  {
    id: "table-create-record",
    tag: "@smoke",
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
    id: "fetched-confirm-dialog-draws-no-posting-form",
    title: "table buttons whose confirm.from reads a mockup fixture an agent wrote draw no input posting to an owner-only route: the component is left out of a dialog that still shows its texts and plain field, a dialog with a secret field does not open, and the owner's clicks send nothing there",
    entryPoint: "MCP tools mockup_write_spec, builder_create_resource, builder_add_block, then the page's toolbar buttons",
    backend: "dev",
    async run(/** @type {Ctx} */ ctx) {
      const suffix = randomBytes(3).toString("hex");
      const labels = { component: `Review export ${suffix}`, field: `Renew token ${suffix}` };
      const pageRoute = await withBridge(ctx, async (session) => {
        const spec = {
          version: 1,
          title: "Export review",
          pages: [{ id: DIALOG_PAGE, title: "Review", fixtures: { ...DIALOGS, rows: [{ _id: "r1", name: "Row" }] }, tree: [{ type: "TableView", options: { caption: "Rows", fetchUrl: "fixture:rows", rowIdKey: "_id", columns: { name: { name: "Name", type: "string" } } } }] }],
        };
        const written = toolText(await session.call("mockup_write_spec", { mockup: DIALOG_MOCKUP, spec }));
        const resource = await operation(session, "builder_create_resource", { name: `shipment${suffix}`, fields: [{ name: "label", dataType: { $dataType: "string" } }], seeds: [{ _id: "s1", label: "First" }] });
        const [page] = itemsOf(parseJson(toolText(await session.call("builder_list_pages")).text));
        const pageRef = textOf(fieldOf(page, "ref"));
        const button = (/** @type {keyof typeof DIALOGS} */ key) => ({ label: labels[key], target: { type: "external", url: "https://example.com" }, confirm: { from: fixtureRoute(key) } });
        const added = await operation(session, "builder_add_block", {
          page: pageRef,
          name: `shipments${suffix}`,
          type: "TableView",
          controller: textOf(fieldOf(resource.data, "ref")),
          config: { customButtons: [button("component"), button("field")] },
        });
        await ctx.verify("the agent's Safe tools write the fixtures and the buttons", [
          ctx.holds("mockup_write_spec saves the dialog fixtures", !written.isError && fieldOf(parseJson(written.text), "ok") === true, written.text.slice(0, 300)),
          ctx.holds("builder_create_resource saves the resource", resource.ok, resource.raw.slice(0, 300)),
          ctx.holds("builder_add_block adds the table with its buttons", added.ok, added.raw.slice(0, 400)),
        ], { critical: true });
        return pageRef;
      });
      const built = await rebuild(ctx);
      await ctx.verify("the project compiles and the backend restarts on it", [ctx.holds("tsc exits 0", built.passed, built.output)], { critical: true });
      const fixture = await ctx.api("GET the component dialog fixture", { method: "GET", path: fixtureRoute("component") });
      await ctx.verify("the fixture route answers the agent's dialog to the owner", [
        ctx.status(fixture, 200),
        ctx.equal("the dialog's component", fieldOf(fieldOf(fixture.body, "component"), "componentName"), "dms-input-secret"),
      ], { critical: true });
      const tab = await signedIn(ctx);
      /** @type {string[]} */
      const sent = [];
      tab.page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.pathname === OWNER_ONLY_ROUTE) sent.push(`${request.method()} ${url.search}`);
      });
      await tab.goto(pageRoute);
      await tab.click({ role: "button", name: labels.component });
      await ctx.verify("the component dialog opens on the agent's texts and its plain field", [
        tab.visible({ role: "dialog", name: "Approve the export?" }),
        tab.visible({ role: "textbox", name: "Note" }),
      ], { critical: true });
      const componentRotations = await rotateEach(tab);
      await tab.page.keyboard.press("Escape");
      await tab.click({ role: "button", name: labels.field });
      await tab.page.waitForTimeout(2_000);
      const fieldDialogOpened = await tab.page.getByRole("dialog", { name: "Renew the export token?" }).isVisible();
      const fieldRotations = fieldDialogOpened ? await rotateEach(tab) : 0;
      await ctx.verify("neither dialog draws an input posting to the owner-only route, and nothing reaches it", [
        ctx.equal("Rotate buttons the component dialog drew", componentRotations, 0),
        ctx.equal("the secret field's dialog opened", fieldDialogOpened, false),
        ctx.equal("Rotate buttons the secret field's dialog drew", fieldRotations, 0),
        ctx.equal("requests to the owner-only route", sent, []),
      ]);
    },
  },
  {
    id: "matrix-cell-edit-persists",
    title: "a Matrix cell typed with the keyboard is saved as it is left, and its value survives a reload and reads back from the route",
    entryPoint: "/matrix/matrix-allocation > Correction de stock, a cell typed into",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      const before = await countedAtNamur(ctx, "read the count before");
      const typed = String((before ?? 4) + 3);
      await tab.goto(MATRIX_ALLOCATION);
      await tab.click(MATRIX_CELL);
      for (const key of typed) await tab.press(key);
      await tab.press("Enter");
      await ctx.verify("the cell shows the value typed", [matrixCellShows(ctx, tab, typed)], { critical: true });
      await tab.reload();
      await ctx.verify("the value is still there after a reload", [matrixCellShows(ctx, tab, typed)]);
      await ctx.verify("the route holds the value typed", [ctx.equal("NE1 size 38", await countedAtNamur(ctx, "read the count after"), Number(typed))]);
    },
  },
  {
    id: "agenda-booking-persists",
    title: "booking mode opens a new booking at the first free hour, and the booking created from it survives a reload and reads back from the route",
    entryPoint: "/agenda/agenda-bookings?plan=next > New booking > Create",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      const before = new Set((await bookingsAhead(ctx, "read the bookings before")).map((event) => event.id));
      await tab.goto(`${AGENDA_BOOKINGS}?plan=next`);
      await ctx.verify("booking mode opens a new booking", [tab.visible({ role: "dialog", name: "New booking" }), tab.shows(/Proposed: the first free hour/)], { critical: true });
      await tab.click({ role: "button", name: "Create" });
      await ctx.verify("the booking is saved and the URL no longer asks for a proposal", [
        tab.visible({ role: "dialog", name: "New booking" }, { hidden: true, timeoutMs: 15_000 }),
        ctx.holds("the URL has no plan key", !tab.page.url().includes("plan="), tab.page.url()),
      ]);
      await tab.reload();
      const added = (await bookingsAhead(ctx, "read the bookings after")).filter((event) => !before.has(event.id));
      await ctx.verify("the route holds one new booking, in a room", [
        ctx.equal("bookings added", added.length, 1),
        ctx.holds("the new booking names its room", (added[0]?.resourceIds?.length ?? 0) > 0, JSON.stringify(added[0])),
      ]);
      await ctx.verify("the page still opens on the rooms after the reload, with no new booking dialog", [
        tab.visible({ role: "dialog", name: "New booking" }, { hidden: true, timeoutMs: 5_000 }),
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
