// Checks that many tabs of one browser can use a running DMS at once: opens
// `--tabs` tabs of one profile, signed in, counts the long-lived streams they
// hold to the dashboard's origin, then times a request from every tab.
//
//   pnpm --dir packages/dms realtime:tabs-check --email <e> --password <p>
//     [--base-url <url>] [--tabs <n>] [--path </page>] [--channel <chrome|msedge>]
//     [--max-streams <n>] [--timeout <ms>] [--legacy-streams <n>]
//
// Over HTTP/1.1 a browser opens at most six connections per host, and each
// stream holds one: if the tabs hold them all, every other request waits.
// Defaults to the playground's frontend, http://localhost:3001, and 8 tabs;
// DMS_CHECK_EMAIL and DMS_CHECK_PASSWORD stand in for the flags.
//
// `--legacy-streams <n>` opens n extra connection streams per tab, as a
// client that does not share its connection between tabs, to see the check
// fail.

import { parseArgs } from "node:util";
import { chromium } from "playwright-core";

const DEFAULT_BASE_URL = "http://localhost:3001";
const DEFAULT_TABS = 8;
// The browser's shared realtime connection, plus in development the reload
// stream its signed-out tabs share (the tab the script signs in from).
const DEFAULT_MAX_STREAMS = 2;
const DEFAULT_TIMEOUT_MS = 5_000;
const NAVIGATION_TIMEOUT_MS = 60_000;
// Long enough for a tab's realtime session to open after its page loads.
const SETTLE_MS = 3_000;
const SIGN_IN_PATH = "/auth";
const LOGIN_PATH = "/auth/login";
const PROBE_PATH = "/api/_auth/session";
const LEGACY_STREAM_PATH = "/api/realtime/connection";
const STREAM_PATHS = ["/api/realtime/connection", "/dms/dev/reload"];

function readOptions() {
  const { values } = parseArgs({
    options: {
      "base-url": { type: "string" },
      tabs: { type: "string" },
      path: { type: "string" },
      email: { type: "string" },
      password: { type: "string" },
      channel: { type: "string" },
      "max-streams": { type: "string" },
      timeout: { type: "string" },
      "legacy-streams": { type: "string" },
    },
  });
  const email = values.email ?? process.env.DMS_CHECK_EMAIL;
  const password = values.password ?? process.env.DMS_CHECK_PASSWORD;
  if (!email || !password) {
    throw new Error("--email and --password (or DMS_CHECK_*) are required");
  }
  return {
    baseUrl: (values["base-url"] ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
    tabs: Number(values.tabs ?? DEFAULT_TABS),
    path: values.path ?? "/",
    email,
    password,
    channel: values.channel ?? "chrome",
    maxStreams: Number(values["max-streams"] ?? DEFAULT_MAX_STREAMS),
    timeoutMs: Number(values.timeout ?? DEFAULT_TIMEOUT_MS),
    legacyStreams: Number(values["legacy-streams"] ?? 0),
  };
}

/** The streams the tabs hold open, as the browser sees them. */
function trackStreams(context, baseUrl) {
  const open = new Set();
  let peak = 0;
  const isStream = (request) => {
    const url = new URL(request.url());
    return (
      url.origin === new URL(baseUrl).origin &&
      STREAM_PATHS.includes(url.pathname)
    );
  };
  const settle = (request) => open.delete(request);
  context.on("request", (request) => {
    if (!isStream(request)) return;
    open.add(request);
    peak = Math.max(peak, open.size);
  });
  context.on("requestfinished", settle);
  context.on("requestfailed", settle);
  return {
    open: () => [...open].map((request) => new URL(request.url()).pathname),
    peak: () => peak,
  };
}

async function signIn(page, options) {
  await page.goto(`${options.baseUrl}${SIGN_IN_PATH}`, {
    waitUntil: "load",
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  const status = await page.evaluate(
    async ({ path, email, password }) => {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, keep_login: true }),
      });
      return response.status;
    },
    { path: LOGIN_PATH, email: options.email, password: options.password },
  );
  if (status >= 400) throw new Error(`Sign-in answered ${status}`);
}

async function openLegacyStreams(page, count) {
  const open = () =>
    page.evaluate(
      ({ path, count: streams }) => {
        for (let index = 0; index < streams; index += 1) {
          void fetch(path, { credentials: "include" }).catch(() => {});
        }
      },
      { path: LEGACY_STREAM_PATH, count },
    );
  const opened = open().then(() => true);
  if (await withDeadline(opened, NAVIGATION_TIMEOUT_MS)) return;
  // The page redirected on its own after loading: open them on the next one.
  await withDeadline(page.waitForLoadState("load"), NAVIGATION_TIMEOUT_MS);
  await withDeadline(open(), NAVIGATION_TIMEOUT_MS);
}

/**
 * `promise`, or `null` once `ms` passed: a tab still navigating holds an
 * evaluation until its page exists, which may be never.
 */
function withDeadline(promise, ms) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise.catch(() => null), deadline]).finally(() =>
    clearTimeout(timer),
  );
}

/** How long a plain request from the tab takes, or `null` past the timeout. */
function probe(page, timeoutMs) {
  const request = page.evaluate(
    async ({ path, timeoutMs: limit }) => {
      const started = performance.now();
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), limit);
      try {
        await fetch(path, { cache: "no-store", signal: abort.signal });
        return Math.round(performance.now() - started);
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
    { path: PROBE_PATH, timeoutMs },
  );
  return withDeadline(request, timeoutMs);
}

async function openTabs(context, options) {
  const pages = [];
  for (let index = 0; index < options.tabs; index += 1) {
    const page = await context.newPage();
    const started = Date.now();
    let loadMs = null;
    try {
      await page.goto(`${options.baseUrl}${options.path}`, {
        waitUntil: "load",
        timeout: NAVIGATION_TIMEOUT_MS,
      });
      loadMs = Date.now() - started;
    } catch {
      // Reported below: a tab that never loads is the failure looked for.
    }
    console.log(
      `  tab ${index + 1}: ${loadMs === null ? "never loaded" : `loaded ${loadMs} ms`}`,
    );
    if (options.legacyStreams && loadMs !== null) {
      await openLegacyStreams(page, options.legacyStreams);
    }
    pages.push({ page, loadMs });
  }
  return pages;
}

function report(options, streams, tabs, probes) {
  console.log("Requests from each tab:");
  for (const [index, ms] of probes.entries()) {
    const request =
      ms === null ? `still pending after ${options.timeoutMs} ms` : `${ms} ms`;
    console.log(`  tab ${index + 1}: ${request}`);
  }
  const open = streams.open();
  console.log(
    `Long-lived streams open: ${open.length} (peak ${streams.peak()}): ${open.join(", ") || "none"}`,
  );
  const failures = [];
  if (tabs.some((tab) => tab.loadMs === null))
    failures.push("a tab never loaded");
  if (probes.some((ms) => ms === null)) failures.push("a request never left");
  if (streams.peak() > options.maxStreams) {
    failures.push(`more than ${options.maxStreams} streams were open at once`);
  }
  return failures;
}

const options = readOptions();
const browser = await chromium.launch({ channel: options.channel });
try {
  const context = await browser.newContext();
  const streams = trackStreams(context, options.baseUrl);
  await signIn(await context.newPage(), options);
  console.log(
    `Opening ${options.tabs} tabs on ${options.baseUrl}${options.path}`,
  );
  const tabs = await openTabs(context, options);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  const probes = await Promise.all(
    tabs.map(({ page }) => probe(page, options.timeoutMs)),
  );
  const failures = report(options, streams, tabs, probes);
  if (failures.length) {
    console.error(`FAILED: ${failures.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log("OK: every tab loaded and every request went through");
  }
} finally {
  await browser.close();
}
