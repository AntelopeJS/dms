import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { describeFailure } from "./failure.mjs";
import { importFrom } from "./mongo.mjs";
import { loadRun } from "./run-state.mjs";

/**
 * @typedef {import("playwright-core").Browser} Browser
 * @typedef {import("playwright-core").BrowserContext} BrowserContext
 * @typedef {import("playwright-core").Locator} Locator
 * @typedef {import("playwright-core").Page} Page
 * @typedef {{ ok: boolean, url: string, error: string | null, aria: string }} Outcome
 * @typedef {{ do: string, baseUrl: string, target?: Target, value?: string, key?: string, path?: string, state?: "attached" | "detached" | "visible" | "hidden", timeoutMs?: number }} Action
 * @typedef {Omit<Action, "baseUrl"> & { account: string, tab: string, folder: string }} BrowserRequest
 */

const ACTION_TIMEOUT_MS = 15_000;
const NAVIGATION_TIMEOUT_MS = 60_000;
const SETTLE_MS = 400;
const VIEWPORT = { width: 1280, height: 900 };

/**
 * Launches the headless Chromium that playwright-core pins.
 *
 * @param {string[]} from Folders to resolve playwright-core from
 * @returns {Promise<Browser>} The Playwright browser
 */
export async function launchBrowser(from) {
  /** @type {typeof import("playwright-core")} */
  const { chromium } = await importFrom("playwright-core", from);
  return chromium.launch({ headless: true });
}

/**
 * A new browser context: one per account, so cookies never leak between
 * the users a journey plays.
 *
 * @param {Browser} browser The Playwright browser
 * @returns {Promise<BrowserContext>} The context
 */
export function newContext(browser) {
  return browser.newContext({
    viewport: VIEWPORT,
    locale: "en-US",
    colorScheme: "light",
  });
}

/**
 * What an action targets: an ARIA role and accessible name, optionally
 * inside another one (`within`), or the n-th of several matches.
 *
 * @typedef {{ role: string, name?: string, exact?: boolean, nth?: number, within?: { role: string, name?: string, exact?: boolean } }} Target
 */

/**
 * The locator of a target, by role and accessible name, as a user finds it.
 *
 * @param {Page} page The Playwright page
 * @param {Target} target What to find
 * @returns {Locator} The locator
 */
export function locate(page, target) {
  const scope = target.within
    ? page
        .getByRole(target.within.role, {
          name: target.within.name,
          exact: target.within.exact,
        })
        .first()
    : page;
  const found = scope.getByRole(target.role, {
    name: target.name,
    exact: target.exact,
  });
  return target.nth === undefined ? found : found.nth(target.nth);
}

/**
 * How a target reads in evidence and checks, such as `button "Invite"`.
 *
 * @param {Target} target The target
 * @returns {string} The description
 */
export function describeTarget(target) {
  const own = `${target.role}${target.name === undefined ? "" : ` "${target.name}"`}${target.nth === undefined ? "" : ` #${target.nth}`}`;
  return target.within ? `${own} in ${describeTarget(target.within)}` : own;
}

/** @type {Record<string, (page: Page, action: Action) => Promise<unknown> | undefined>} */
const ACTIONS = {
  goto: (page, action) =>
    page.goto(new URL(action.path, action.baseUrl).href, {
      waitUntil: "load",
      timeout: NAVIGATION_TIMEOUT_MS,
    }),
  reload: (page) =>
    page.reload({ waitUntil: "load", timeout: NAVIGATION_TIMEOUT_MS }),
  click: (page, action) =>
    locate(page, action.target).click({ timeout: ACTION_TIMEOUT_MS }),
  fill: (page, action) =>
    locate(page, action.target).fill(action.value, {
      timeout: ACTION_TIMEOUT_MS,
    }),
  select: (page, action) =>
    locate(page, action.target).selectOption(
      { label: action.value },
      { timeout: ACTION_TIMEOUT_MS },
    ),
  check: (page, action) =>
    locate(page, action.target).check({ timeout: ACTION_TIMEOUT_MS }),
  uncheck: (page, action) =>
    locate(page, action.target).uncheck({ timeout: ACTION_TIMEOUT_MS }),
  hover: (page, action) =>
    locate(page, action.target).hover({ timeout: ACTION_TIMEOUT_MS }),
  press: (page, action) =>
    action.target
      ? locate(page, action.target).press(action.key, {
          timeout: ACTION_TIMEOUT_MS,
        })
      : page.keyboard.press(action.key),
  snapshot: () => undefined,
  screenshot: () => undefined,
  wait: (page, action) =>
    locate(page, action.target).waitFor({
      state: action.state ?? "visible",
      timeout: action.timeoutMs ?? ACTION_TIMEOUT_MS,
    }),
};

/** The action names `perform` accepts. */
export const ACTION_NAMES = Object.keys(ACTIONS);

/**
 * Writes what the page shows into `folder`: `url.txt`, `aria.yml` (the ARIA
 * snapshot of the body) and `screenshot.png`.
 *
 * @param {Page} page The Playwright page
 * @param {string} folder The evidence folder
 * @returns {Promise<string>} The ARIA snapshot
 */
export async function capture(page, folder) {
  writeFileSync(join(folder, "url.txt"), `${page.url()}\n`);
  const aria = await page
    .locator("body")
    .ariaSnapshot({ timeout: ACTION_TIMEOUT_MS })
    .catch(
      (/** @type {unknown} */ error) =>
        `snapshot failed: ${describeFailure(error)}`,
    );
  writeFileSync(join(folder, "aria.yml"), `${aria}\n`);
  await page
    .screenshot({
      path: join(folder, "screenshot.png"),
      fullPage: true,
      timeout: ACTION_TIMEOUT_MS,
    })
    .catch(() => undefined);
  return aria;
}

/**
 * Runs one action on a page, then captures the page into `folder`. A target
 * that is missing, hidden or disabled past the timeout fails the action.
 *
 * @param {Page} page The Playwright page
 * @param {Action} action What to do
 * @param {string} folder The evidence folder
 * @returns {Promise<Outcome>} The outcome
 */
export async function perform(page, action, folder) {
  const run = ACTIONS[action.do];
  if (!run)
    throw new Error(
      `Unknown browser action ${action.do}; expected one of ${ACTION_NAMES.join(", ")}`,
    );
  writeFileSync(
    join(folder, "action.json"),
    `${JSON.stringify({ ...action, target: action.target && describeTarget(action.target) }, null, 2)}\n`,
  );
  let error = null;
  try {
    await run(page, action);
    await page
      .waitForLoadState("load", { timeout: NAVIGATION_TIMEOUT_MS })
      .catch(() => undefined);
    await page.waitForTimeout(SETTLE_MS);
  } catch (failure) {
    error = describeFailure(failure).split("\n")[0];
  }
  const aria = await capture(page, folder);
  return { ok: error === null, url: page.url(), error, aria };
}

/**
 * Signs an account in through the sign-in form, the way a user does.
 *
 * @param {Page} page The Playwright page
 * @param {{ email: string, password: string }} credentials The account
 * @param {{ baseUrl: string, folder: (label: string) => string }} options Where the frontend is and where evidence goes
 * @returns {Promise<Outcome>} The outcome of the last step
 */
export async function signInThroughForm(page, credentials, options) {
  const steps = [
    { do: "goto", path: "/auth" },
    {
      do: "fill",
      target: { role: "textbox", name: "Email address" },
      value: credentials.email,
    },
    {
      do: "fill",
      target: { role: "textbox", name: "Password", exact: true },
      value: credentials.password,
    },
    { do: "click", target: { role: "button", name: "Login", exact: true } },
  ];
  let outcome = { ok: true, url: page.url(), error: null, aria: "" };
  for (const step of steps) {
    outcome = await perform(
      page,
      { ...step, baseUrl: options.baseUrl },
      options.folder(`sign in ${step.do} ${step.target?.name ?? step.path}`),
    );
    if (!outcome.ok) return outcome;
  }
  await page
    .waitForURL((url) => !url.pathname.startsWith("/auth"), {
      timeout: NAVIGATION_TIMEOUT_MS,
    })
    .catch(() => undefined);
  return {
    ...outcome,
    url: page.url(),
    ok: !new URL(page.url()).pathname.startsWith("/auth"),
  };
}

/**
 * Serves the run's browser for `dms-control browser`: one context per
 * account and one page per tab name, kept between commands, driven by JSON
 * posted to a loopback port. A GET answers 200 once it listens. It exits
 * when the browser closes, which Playwright does on SIGTERM.
 *
 * @param {string} dir The run folder
 * @param {string[]} from Folders to resolve playwright-core from
 * @param {number} port The loopback port
 * @returns {Promise<void>} Resolves once listening
 */
export async function serveBrowser(dir, from, port) {
  const browser = await launchBrowser(from);
  browser.on("disconnected", () => process.exit(0));
  /** @type {Map<string, BrowserContext>} */
  const contexts = new Map();
  /** @type {Map<string, Page>} */
  const pages = new Map();
  /**
   * @param {string} account The account
   * @param {string} tab The tab name
   * @returns {Promise<Page>} The tab's page
   */
  const pageFor = async (account, tab) => {
    const key = `${account}/${tab}`;
    if (!pages.has(key)) {
      if (!contexts.has(account))
        contexts.set(account, await newContext(browser));
      pages.set(key, await contexts.get(account).newPage());
    }
    return pages.get(key);
  };
  /**
   * @param {BrowserRequest} request What the client posted
   * @returns {Promise<Outcome>} The outcome
   */
  const handle = async (request) => {
    const state = loadRun(dir);
    const page = await pageFor(request.account, request.tab);
    if (request.do === "login") {
      const credentials = state.accounts?.[request.account];
      if (!credentials)
        return {
          ok: false,
          url: page.url(),
          error: `no account ${request.account}; run dms-control onboard first`,
          aria: "",
        };
      return signInThroughForm(page, credentials, {
        baseUrl: state.webUrl,
        folder: () => request.folder,
      });
    }
    return perform(page, { ...request, baseUrl: state.webUrl }, request.folder);
  };
  const server = createServer((incoming, outgoing) => {
    if (incoming.method !== "POST") {
      outgoing.end("ok");
      return;
    }
    /** @type {Buffer[]} */
    const chunks = [];
    incoming.on("data", (/** @type {Buffer} */ chunk) => chunks.push(chunk));
    incoming.on("end", () => {
      handle(JSON.parse(Buffer.concat(chunks).toString("utf8")))
        .then((result) => outgoing.end(JSON.stringify(result)))
        .catch((/** @type {unknown} */ error) =>
          outgoing.end(
            JSON.stringify({
              ok: false,
              url: "",
              error: describeFailure(error),
              aria: "",
            }),
          ),
        );
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}
