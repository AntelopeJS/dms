import { appendFileSync, writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";

const LOG = "fake-browser.log";
const PAGE_LOAD_MS = 20;

/**
 * @param {{ width: number } | { url: string, clock: string | null } | { peak: number }} entry
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

/** @param {{ fixed: string | null }} state */
function newPage(state) {
  return {
    /** @param {string} url */
    goto: async (url) => {
      record({ url, clock: state.fixed });
      await setTimeout(PAGE_LOAD_MS);
    },
    waitForSelector: async () => {},
    waitForFunction: async () => {},
    evaluate: async () => {},
    waitForTimeout: async () => {},
    locator: () => locator,
  };
}

function newContext() {
  /** @type {{ fixed: string | null }} */
  const state = { fixed: null };
  return {
    clock: {
      /** @param {Date} time */
      setFixedTime: async (time) => {
        state.fixed = time.toISOString();
      },
    },
    newPage: async () => newPage(state),
    close: async () => {
      open -= 1;
      record({ peak });
    },
  };
}

const browser = {
  /** @param {{ viewport: { width: number } }} options */
  newContext: async ({ viewport }) => {
    record({ width: viewport.width });
    open += 1;
    peak = Math.max(peak, open);
    return newContext();
  },
  close: async () => {},
};

/** The part of playwright-core's `chromium` that docs-screenshots.mjs drives, answering as a browser whose preview page renders every block. */
export const chromium = { launch: async () => browser };
