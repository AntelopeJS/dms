import { createServer } from "node:http";
import { isBrowserRequest } from "./browser-wire.mjs";
import {
  launchBrowser,
  newContext,
  perform,
  signInThroughForm,
} from "./browser.mjs";
import { describeFailure } from "./failure.mjs";
import { decode } from "./json.mjs";
import { loadRun } from "./run-state.mjs";

/**
 * @typedef {import("playwright-core").BrowserContext} BrowserContext
 * @typedef {import("playwright-core").Page} Page
 * @typedef {import("./browser.mjs").Outcome} Outcome
 * @typedef {Omit<import("./browser.mjs").Action, "baseUrl"> & { account: string, tab: string, folder: string }} BrowserRequest
 */

/**
 * @param {unknown} error What the action threw
 * @returns {Outcome} The failed outcome
 */
function failedOutcome(error) {
  return { ok: false, url: "", error: describeFailure(error), aria: "" };
}

/**
 * Decodes a posted request and answers it. A body that is no valid request
 * is answered as a failed action, like any action that throws.
 *
 * @param {string} body What the client posted
 * @param {(request: BrowserRequest) => Promise<Outcome>} handle Runs one action
 * @returns {Promise<string>} The outcome as JSON
 */
export function answerRequest(body, handle) {
  return Promise.resolve()
    .then(() => {
      /** @type {unknown} */
      const posted = JSON.parse(body);
      return handle(
        decode(isBrowserRequest, posted, "browser request", "a browser action"),
      );
    })
    .catch(failedOutcome)
    .then((outcome) => JSON.stringify(outcome));
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
        state,
      });
    }
    return perform(
      page,
      { ...request, baseUrl: state.webUrl },
      request.folder,
      state,
    );
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
      answerRequest(Buffer.concat(chunks).toString("utf8"), handle)
        .then((answer) => outgoing.end(answer))
        .catch(() => outgoing.destroy());
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}
