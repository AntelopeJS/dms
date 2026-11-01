import { appendFileSync, writeFileSync } from "node:fs";

const LOG = "fake-browser.log";

/**
 * @param {{ width: number } | { url: string }} entry
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

const page = {
  /** @param {string} url */
  goto: async (url) => {
    record({ url });
  },
  waitForSelector: async () => {},
  waitForFunction: async () => {},
  evaluate: async () => {},
  waitForTimeout: async () => {},
  locator: () => locator,
};

const context = {
  newPage: async () => page,
  close: async () => {},
};

const browser = {
  /** @param {{ viewport: { width: number } }} options */
  newContext: async ({ viewport }) => {
    record({ width: viewport.width });
    return context;
  },
  close: async () => {},
};

/** The part of playwright-core's `chromium` that docs-screenshots.mjs drives, answering as a browser whose preview page renders every block. */
export const chromium = { launch: async () => browser };
