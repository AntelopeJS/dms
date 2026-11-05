import { randomUUID } from "node:crypto";
import { listIn, stringIn } from "../../rows.mjs";
import { createRole, joinedMember } from "../settings-members/steps.mjs";

/**
 * @typedef {import("../../../../../packages/dms/bin/control/journey.mjs").JourneyContext} Ctx
 * @typedef {import("../../../../../packages/dms/bin/control/tab.mjs").Tab} Tab
 */

const ACCOUNTS = "/auth/accounts";
const STORAGE_KEY = "antelopejs-accounts";

/**
 * @param {unknown} value A stored entry
 * @returns {value is { userId: string }} Whether it names a user
 */
function isStoredAccount(value) {
  return stringIn(value, "userId") !== undefined;
}

/** The rows the switcher shows, and the user ids stored in this browser. */
async function readSwitcher(/** @type {Tab} */ tab) {
  await tab.goto(ACCOUNTS);
  await tab.page.getByRole("button", { name: "Add an account" }).waitFor();
  await tab.page.waitForTimeout(500);
  const rows = await tab.page.getByRole("main").getByRole("listitem").allInnerTexts();
  const raw = await tab.page.evaluate((key) => localStorage.getItem(key) ?? "[]", STORAGE_KEY);
  /** @type {unknown} */
  const stored = JSON.parse(raw);
  return {
    rows: rows.map((row) => row.replace(/\s+/g, " ").trim()),
    userIds: listIn({ accounts: stored }, "accounts", isStoredAccount).map((account) => account.userId),
  };
}

/** Whether every row and every stored entry names a distinct account. */
function once(/** @type {Ctx} */ ctx, /** @type {string} */ when, /** @type {{ rows: string[], userIds: string[] }} */ seen, /** @type {number} */ expected) {
  return [
    ctx.equal(`rows ${when}`, seen.rows.length, expected),
    ctx.equal(`distinct stored accounts ${when}`, new Set(seen.userIds).size, seen.userIds.length),
    ctx.equal(`stored accounts ${when}`, seen.userIds.length, expected),
  ];
}

async function signInThroughSwitcher(/** @type {Tab} */ tab, /** @type {{ email: string, password: string }} */ account) {
  await tab.goto(ACCOUNTS);
  await tab.click({ role: "button", name: "Add an account" });
  await tab.fill({ role: "textbox", name: "Email address" }, account.email);
  await tab.fill({ role: "textbox", name: "Password", exact: true }, account.password);
  await tab.click({ role: "button", name: "Login", exact: true });
  await tab.page.waitForURL((url) => !url.pathname.startsWith("/auth"));
}

async function switchTo(/** @type {Tab} */ tab, /** @type {string} */ name) {
  await tab.goto(ACCOUNTS);
  await tab.page.getByRole("main").getByRole("button", { name: new RegExp(`^(?!Remove )\\S+ ${name} `) }).click();
  await tab.page.waitForURL((url) => !url.pathname.startsWith("/auth"));
}

/**
 * Plants the entry a previous user record of the same person leaves behind:
 * the signed-in account under another user id, older and expired.
 */
async function plantRecreatedEntry(/** @type {Tab} */ tab) {
  const raw = await tab.page.evaluate((key) => localStorage.getItem(key) ?? "[]", STORAGE_KEY);
  /** @type {unknown} */
  const parsed = JSON.parse(raw);
  const stored = listIn({ accounts: parsed }, "accounts", isStoredAccount);
  const [current] = stored;
  if (!current) throw new Error("no stored account to copy");
  const previous = { ...current, accountId: randomUUID(), userId: randomUUID(), lastUsed: "2020-01-01T00:00:00.000Z", isExpired: true };
  await tab.page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify([...stored, previous])]);
}

/** The accounts switcher. */
export const accountJourneys = [
  {
    id: "switcher-lists-each-account-once",
    title: "the accounts switcher lists each signed-in account once across re-logins, switches, reloads and a second tab",
    entryPoint: "/auth/accounts",
    async run(/** @type {Ctx} */ ctx) {
      const roleName = ctx.unique("Support");
      await createRole(ctx, roleName);
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      const bob = await joinedMember(ctx, admin, { firstName: "Bob", roleName });
      await bob.tab.close();
      const adminCredentials = ctx.adminCredentials();

      await ctx.verify("one account after the first sign-in", once(ctx, "after sign-in", await readSwitcher(admin), 1));
      await signInThroughSwitcher(admin, bob);
      await ctx.verify("two accounts after adding a second", once(ctx, "after adding Bob", await readSwitcher(admin), 2));
      await switchTo(admin, "Verify Admin");
      await ctx.verify("two accounts after switching back", once(ctx, "after switching to the admin", await readSwitcher(admin), 2));
      await signInThroughSwitcher(admin, adminCredentials);
      await ctx.verify("two accounts after signing the active account in again", once(ctx, "after re-login of the admin", await readSwitcher(admin), 2));
      await switchTo(admin, "Bob");
      await signInThroughSwitcher(admin, bob);
      await ctx.verify("two accounts after signing the other account in again", once(ctx, "after re-login of Bob", await readSwitcher(admin), 2));
      await admin.reload();
      await ctx.verify("two accounts after a reload", once(ctx, "after a reload", await readSwitcher(admin), 2));
      const second = await ctx.tab("admin", "second-tab");
      await switchTo(second, "Verify Admin");
      await switchTo(admin, "Verify Admin");
      await ctx.verify("two accounts after switching in two tabs", once(ctx, "after switching in two tabs", await readSwitcher(admin), 2));
      await ctx.verify("two accounts in the second tab", once(ctx, "in the second tab", await readSwitcher(second), 2));
    },
  },
  {
    id: "switcher-replaces-recreated-account",
    title: "an entry left by a previous user record of the same person is dropped on load and on the next sign-in",
    entryPoint: "/auth/accounts",
    async run(/** @type {Ctx} */ ctx) {
      const admin = await ctx.tab("admin");
      await admin.signIn("admin");
      await ctx.verify("one account after the first sign-in", once(ctx, "after sign-in", await readSwitcher(admin), 1));
      await plantRecreatedEntry(admin);
      await admin.reload();
      await ctx.verify("the leftover entry is gone after a reload", once(ctx, "after planting a leftover and reloading", await readSwitcher(admin), 1));
      await plantRecreatedEntry(admin);
      await signInThroughSwitcher(admin, ctx.adminCredentials());
      await ctx.verify("the leftover entry is gone after signing in again", once(ctx, "after planting a leftover and signing in", await readSwitcher(admin), 1));
    },
  },
];
