import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { z } from "zod";

const DEFAULT_BASE_URL = "http://localhost:3001";
const PREVIEW_PATH = "/dms-preview";
const THEMES = ["light", "dark"];
const DEFAULT_WIDTH = 720;
const VIEWPORT_HEIGHT = 900;
const DEVICE_SCALE_FACTOR = 2;
const READY_TIMEOUT_MS = 30_000;
const SETTLE_MS = 1_500;
const BYTES_PER_KILOBYTE = 1024;
const PREVIEW_SELECTOR = "[data-dms-block-preview]";
const BLOCK_SELECTOR = "[data-dms-preview-block]";
const ISSUE_SELECTOR = "[data-dms-preview-issue]";
const LOADING_SELECTOR = `${PREVIEW_SELECTOR} .animate-pulse`;

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const examplesPath = join(packageRoot, "docs-data", "examples.json");
const outputDir = join(packageRoot, "docs", "images", "blocks");

/** @typedef {import("playwright-core").Page} Page */
/** @typedef {import("playwright-core").Browser} Browser */
/** @typedef {z.infer<typeof exampleSchema>} Example */
/** @typedef {ReturnType<typeof readOptions>} Options */

const exampleSchema = z.object({
  type: z.string(),
  options: z.unknown(),
  children: z.unknown(),
  width: z.number().optional(),
});

function readOptions() {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string" },
      only: { type: "string" },
      theme: { type: "string" },
    },
  });
  return {
    baseUrl:
      values["base-url"] ?? process.env.DMS_PREVIEW_URL ?? DEFAULT_BASE_URL,
    only: values.only ? new Set(values.only.split(",")) : undefined,
    themes: values.theme ? [values.theme] : THEMES,
  };
}

/** @param {Set<string> | undefined} only */
function readExamples(only) {
  const examples = Object.entries(
    z
      .record(z.string(), exampleSchema)
      .parse(JSON.parse(readFileSync(examplesPath, "utf8"))),
  );
  return only ? examples.filter(([id]) => only.has(id)) : examples;
}

/**
 * @param {string} baseUrl
 * @param {Example} example
 * @param {string} theme
 */
function previewUrl(baseUrl, example, theme) {
  const { type, options, children } = example;
  const state = { tree: { type, options, children }, theme, padding: true };
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${baseUrl}${PREVIEW_PATH}?state=${encoded}`;
}

/** @param {Page} page */
async function waitForBlocks(page) {
  await page.waitForSelector(BLOCK_SELECTOR, { timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(
    (selector) => !document.querySelector(selector),
    LOADING_SELECTOR,
    { timeout: READY_TIMEOUT_MS },
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(SETTLE_MS);
}

/**
 * @param {Browser} browser
 * @param {string} baseUrl
 * @param {[string, Example]} entry
 * @param {string} theme
 */
async function capture(browser, baseUrl, [id, example], theme) {
  const context = await browser.newContext({
    viewport: {
      width: example.width ?? DEFAULT_WIDTH,
      height: VIEWPORT_HEIGHT,
    },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: theme,
  });
  try {
    const page = await context.newPage();
    await page.goto(previewUrl(baseUrl, example, theme), { waitUntil: "load" });
    await waitForBlocks(page);
    if (await page.locator(ISSUE_SELECTOR).count()) {
      throw new Error(await page.locator(ISSUE_SELECTOR).first().innerText());
    }
    const path = join(outputDir, `${id}.${theme}.png`);
    await page
      .locator(PREVIEW_SELECTOR)
      .screenshot({ path, animations: "disabled" });
    return path;
  } finally {
    await context.close();
  }
}

/** @param {string} path */
function report(path) {
  const kilobytes = Math.round(statSync(path).size / BYTES_PER_KILOBYTE);
  console.log(`${relative(process.cwd(), path)} (${kilobytes} KB)`);
}

/**
 * @param {Browser} browser
 * @param {Options} options
 * @param {[string, Example][]} examples
 */
async function captureAll(browser, options, examples) {
  /** @type {string[]} */
  const failures = [];
  for (const entry of examples) {
    for (const theme of options.themes) {
      try {
        report(await capture(browser, options.baseUrl, entry, theme));
      } catch (error) {
        failures.push(`${entry[0]} (${theme}): ${error.message}`);
      }
    }
  }
  return failures;
}

const options = readOptions();
mkdirSync(outputDir, { recursive: true });
const browser = await chromium.launch();
const failures = await captureAll(
  browser,
  options,
  readExamples(options.only),
).finally(() => browser.close());
if (failures.length) {
  console.error(`Not captured:\n${failures.join("\n")}`);
  process.exit(1);
}
