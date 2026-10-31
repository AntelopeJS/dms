/**
 * @typedef {import("../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 */

const MODULES = "/modules";
const STORE = "/modules/store";
const LISTING = "/dms/store/listing";

async function signedIn(/** @type {Ctx} */ ctx) {
  const tab = await ctx.tab("admin");
  await tab.signIn("admin");
  return tab;
}

/** The installed modules page and the module store, read-only outside development. */
export const journeys = [
  {
    id: "installed-modules-open",
    title: "Modules lists the playground's two modules with their status, and Open starts a module from its home page",
    entryPoint: "/modules",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      await tab.goto(MODULES);
      await ctx.verify("both installed modules are listed with their status", [
        tab.visible({ role: "heading", name: "Installed 2" }),
        tab.visible({ role: "article", name: "Demo Module" }),
        tab.visible({ role: "article", name: "Plain Module" }),
        tab.shows(/1 sync job failing/),
      ]);
      await tab.click({ role: "link", name: "Open", within: { role: "article", name: "Demo Module" } });
      await ctx.verify("Open leaves the modules page for the module's home", [tab.at(/^\/(?!modules$)/)]);
      await tab.goto(MODULES);
      await tab.click({ role: "radio", name: "Developer 1" });
      await ctx.verify("the category filter keeps only the developer module", [
        tab.visible({ role: "article", name: "Plain Module" }),
        tab.visible({ role: "article", name: "Demo Module" }, { hidden: true }),
      ]);
    },
  },
  {
    id: "modules-search-empty",
    title: "a module search that matches nothing shows no module, and clearing it brings them back",
    entryPoint: "/modules search, /modules/store search",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      await tab.goto(STORE);
      await tab.fill({ role: "textbox", name: "Search the store" }, "qqxzjjwv");
      await ctx.verify("the store says nothing matches", [
        tab.shows(/No module in the store matches “qqxzjjwv”/),
        tab.count({ role: "article" }, 0),
      ]);
      await tab.click({ role: "button", name: "Clear search" });
      await ctx.verify("clearing the search lists the catalog again", [tab.visible({ role: "article", name: "API" })]);
      await tab.goto(MODULES);
      await tab.fill({ role: "textbox", name: "Search modules" }, "qqxzjjwv");
      await ctx.verify("the installed list hides every module", [tab.count({ role: "article" }, 0)]);
    },
  },
  {
    id: "store-read-only-outside-dev",
    title: "outside development the store lists the catalog with Install disabled, and the install API answers 403",
    entryPoint: "/modules/store, POST /dms/store/install",
    async run(/** @type {Ctx} */ ctx) {
      const tab = await signedIn(ctx);
      await tab.goto(STORE);
      await ctx.verify("the store explains it is read-only and disables Install", [
        tab.shows(/The store is read-only here/),
        tab.enabled({ role: "button", name: "Install", within: { role: "article", name: "API" } }, { disabled: true }),
      ]);
      const install = await ctx.api("install the API module", { method: "POST", path: "/dms/store/install", body: { id: "api" } });
      const listing = await ctx.api("read the store listing", { method: "GET", path: LISTING });
      const api = listing.body?.modules?.find((entry) => entry.id === "api");
      await ctx.verify("nothing is installed", [
        ctx.status(install, 403),
        ctx.equal("error", install.body, "error.store_disabled"),
        ctx.equal("store enabled", listing.body?.enabled, false),
        ctx.equal("the API module stays available, not installed", api?.state, "available"),
      ]);
    },
  },
  {
    id: "store-listing-owners-only",
    title: "the store listing answers the platform owner and refuses a visitor",
    entryPoint: "GET /dms/store/listing",
    async run(/** @type {Ctx} */ ctx) {
      const owner = await ctx.api("read the listing as the owner", { method: "GET", path: LISTING });
      const visitor = await ctx.api("read the listing anonymously", { method: "GET", path: LISTING, as: "anon" });
      await ctx.verify("only the owner reads the catalog", [
        ctx.status(owner, 200),
        ctx.holds("the catalog has modules", (owner.body?.modules ?? []).length > 0, (owner.body?.modules ?? []).length),
        ctx.status(visitor, 403),
      ]);
    },
  },
];
