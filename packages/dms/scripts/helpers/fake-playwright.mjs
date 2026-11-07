import { appendFileSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

const LOG = "fake-browser.log";
const PAGE_LOAD_MS = 20;

/**
 * @param {{ width: number } | { url: string } | { peak: number }} entry
 * @returns {void}
 */
function record(entry) {
  appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
}

const locator = {
  count: async () => 0,
  /** @param {{ path: string }} options */
  screenshot: async ({ path }) => {
    writeFileSync(path, "png");
  },
};

let open = 0;
let peak = 0;

const page = {
  /** @param {string} url */
  goto: async (url) => {
    record({ url });
    await setTimeout(PAGE_LOAD_MS);
  },
  waitForSelector: async () => {},
  waitForFunction: async () => {},
  evaluate: async () => {},
  waitForTimeout: async () => {},
  locator: () => locator,
};

const context = {
  newPage: async () => page,
  close: async () => {
    open -= 1;
    record({ peak });
  },
};

const browser = {
  /** @param {{ viewport: { width: number } }} options */
  newContext: async ({ viewport }) => {
    record({ width: viewport.width });
    open += 1;
    peak = Math.max(peak, open);
    return context;
  },
  close: async () => {},
};

/** The part of playwright-core's `chromium` that docs-screenshots.mjs drives, answering as a browser whose preview page renders every block. */
export const chromium = { launch: async () => browser };
