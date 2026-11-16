/**
 * @typedef {import("@antelopejs/dms/e2e").Ctx} Ctx
 * @typedef {import("@antelopejs/dms/e2e").Tab} Tab
 */

const VIEWS_PAGE = "/table-view/table-view-views";
const STRIP = { role: "toolbar", name: "Views" };
const CUSTOM = { role: "status", name: /A filter or search the view sets was removed or changed/, within: STRIP };
const CHANGED_SUFFIX = "Changed since the view was opened";
const FAILING_RUNS = "Job runs 1";
const ALL_RUNS = "Job runs 32";
const ROW_OF_FAILING_VIEW = { role: "cell", name: "Sync paid invoices to ERP" };

/**
 * @param {Tab} tab
 * @param {string | RegExp} name A button of the views strip
 * @param {boolean} pressed Whether it is the open view
 * @returns {Promise<{ name: string, pass: boolean, detail: string }>} The check
 */
async function openView(tab, name, pressed) {
  const button = tab.page.getByRole("toolbar", { name: "Views" }).getByRole("button", { name, pressed });
  const reached = await button
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  return { name: `the strip ${pressed ? "draws" : "does not draw"} ${String(name)} open`, pass: reached, detail: tab.page.url() };
}

/** @param {Tab} tab */
async function reset(tab) {
  await tab.click({ role: "button", name: "Reset", exact: true, within: STRIP });
}

/** @param {Tab} tab */
async function reopenFailing(tab) {
  await tab.click({ role: "button", name: /^Failing/, within: STRIP });
}

/**
 * Adds the filter `Procedure is empty`, which no run satisfies, so it narrows the open view to nothing.
 *
 * @param {Tab} tab
 */
async function narrowToNothing(tab) {
  await tab.click({ role: "button", name: "Add a filter" });
  await tab.click({ role: "combobox", within: { role: "dialog", name: "Add a filter" }, nth: 0 });
  await tab.click({ role: "option", name: "Procedure" });
  await tab.click({ role: "combobox", within: { role: "dialog", name: "Add a filter" }, nth: 1 });
  await tab.click({ role: "option", name: "Is empty" });
  await tab.click({ role: "button", name: "Add", exact: true, within: { role: "dialog", name: "Add a filter" } });
}

/**
 * Hides a column of the Job runs table from its header's options menu.
 *
 * @param {Tab} tab
 * @param {string} column The column's header
 */
async function hideColumn(tab, column) {
  await tab.click({ role: "button", within: { role: "columnheader", name: column, exact: true }, nth: 1 });
  await tab.click({ role: "menuitem", name: "Hide", exact: true });
}

/**
 * @param {Tab} tab
 * @param {string} column The column's header
 * @param {boolean} hidden Whether the Job runs table hides it
 * @returns {Promise<{ name: string, pass: boolean, detail: string }>} The check
 */
async function columnShown(tab, column, hidden) {
  const header = tab.page.getByRole("table").first().getByRole("columnheader", { name: column, exact: true });
  const isShown = await header.waitFor({ state: hidden ? "hidden" : "visible", timeout: 15_000 }).then(
    () => !hidden,
    () => hidden,
  );
  return { name: `the Job runs table ${hidden ? "hides" : "shows"} ${column}`, pass: isShown === !hidden, detail: tab.page.url() };
}

/** A table view's saved views: the strip names a view only while the table lists what the view lists. */
export const journeys = [
  {
    id: "table-view-strip-follows-filter-changes",
    title: "a saved view stays open as modified under an extra filter, and reads Custom filters once the table stops listing its own filters",
    entryPoint: "/table-view/table-view-views, the views strip above the Job runs table",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(VIEWS_PAGE);
      await reopenFailing(tab);
      await tab.click({ role: "button", name: "Filters", nth: 0 });
      await ctx.verify("opening Failing draws it open and lists its run", [
        await openView(tab, "Failing 1", true),
        tab.visible({ role: "heading", name: FAILING_RUNS }),
        tab.visible(ROW_OF_FAILING_VIEW),
        tab.visible(CUSTOM, { hidden: true, timeoutMs: 3_000 }),
      ]);

      await narrowToNothing(tab);
      await ctx.verify("a narrower extra filter keeps Failing open and marked as changed", [
        await openView(tab, `Failing 0 ${CHANGED_SUFFIX}`, true),
        tab.visible({ role: "button", name: "Reset", exact: true, within: STRIP }),
        tab.visible(CUSTOM, { hidden: true, timeoutMs: 3_000 }),
        tab.visible({ role: "heading", name: "Job runs", exact: true }),
      ]);
      await reset(tab);
      await ctx.verify("Reset drops the extra filter and restores the view's count", [
        await openView(tab, "Failing 1", true),
        tab.visible({ role: "heading", name: FAILING_RUNS }),
        tab.visible({ role: "button", name: /^Procedure Is empty/ }, { hidden: true }),
        tab.visible(ROW_OF_FAILING_VIEW),
      ]);

      await tab.click({ role: "button", name: "Delete", nth: 0 });
      await ctx.verify("clearing the view's own filter reads Custom filters, not Failing", [
        tab.visible(CUSTOM),
        tab.visible({ role: "button", name: "Reset", exact: true, within: STRIP }),
        tab.visible({ role: "button", name: "Save current view", within: STRIP }),
        await openView(tab, /^Failing/, false),
        await openView(tab, "Failing 1", false),
        tab.visible({ role: "heading", name: ALL_RUNS }),
      ]);
      await reopenFailing(tab);
      await ctx.verify("clicking Failing opens it again", [
        await openView(tab, "Failing 1", true),
        tab.visible({ role: "heading", name: FAILING_RUNS }),
        tab.visible(CUSTOM, { hidden: true }),
      ]);

      await tab.click({ role: "button", name: "Status Is Failing" });
      await tab.click({ role: "combobox", within: { role: "dialog", name: "Status Is Failing" } });
      await tab.click({ role: "option", name: "Paused" });
      await ctx.verify("changing the view's own filter reads Custom filters, not Failing", [
        tab.visible(CUSTOM),
        tab.visible({ role: "button", name: /^Status Is Paused/ }),
        await openView(tab, "Failing 1", false),
        tab.visible({ role: "button", name: "Save current view", within: STRIP }),
      ]);
      await tab.press("Escape");
      await reset(tab);
      await ctx.verify("Reset on a table that left the view opens it again", [
        await openView(tab, "Failing 1", true),
        tab.visible({ role: "heading", name: FAILING_RUNS }),
        tab.visible(CUSTOM, { hidden: true }),
      ]);

      await tab.click({ role: "button", name: "Clear filters", exact: true });
      await ctx.verify("Clear filters reads Custom filters over every run, as the report Failing under Draft did", [
        tab.visible(CUSTOM),
        await openView(tab, "Failing 1", false),
        tab.visible({ role: "heading", name: ALL_RUNS }),
      ]);
    },
  },
  {
    id: "table-view-hidden-column-survives-reload",
    title: "a column hidden under the default view a first visit opened, or under a module's view, stays hidden after a reload",
    entryPoint: "/table-view/table-view-views, the options menu of a column header of the Job runs table",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await ctx.tab("admin");
      await tab.signIn("admin");
      await tab.goto(VIEWS_PAGE);
      await hideColumn(tab, "Output");
      await ctx.verify("hiding Output under the default view drops its column", [
        await openView(tab, "All runs", true),
        await columnShown(tab, "Output", true),
      ]);
      await tab.reload();
      await ctx.verify("after a reload the default view is open and Output stays hidden", [
        await openView(tab, "All runs", true),
        await columnShown(tab, "Output", true),
        await columnShown(tab, "Status", false),
      ]);

      await reopenFailing(tab);
      await hideColumn(tab, "Status");
      await ctx.verify("hiding Status under Failing drops its column", [
        await openView(tab, /^Failing 1/, true),
        await columnShown(tab, "Status", true),
      ]);
      await tab.reload();
      await ctx.verify("after a reload Failing is open and Status stays hidden", [
        await openView(tab, /^Failing 1/, true),
        await columnShown(tab, "Status", true),
      ]);
    },
  },
];
