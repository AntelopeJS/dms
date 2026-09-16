import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ITERATIONS = 7;
const DEFAULT_SOURCE_URL = "http://127.0.0.1:3001/form/form-simple";
const DEFAULT_TARGET_SELECTOR = 'a[href="/form/form-advanced"]';
const CLICK_TARGET_SELECTOR = "[data-dms-performance-target]";
const DEFAULT_OUTPUT = ".amp/in/artifacts/dms-frontend-navigation-gate.json";
const READY_SELECTOR = "html[data-dms-ready='true']";
const READY_ATTEMPTS = 60;
const READY_POLL_MS = 1000;
const BUDGETS = {
  medianDurationMs: 1500,
  medianPayloadBytes: 75_000,
  medianRequestCount: 3,
};
const session =
  process.env.DMS_PERF_BROWSER_SESSION ?? `dms-navigation-${process.pid}`;
const sourceUrl = process.env.DMS_PERF_SOURCE_URL ?? DEFAULT_SOURCE_URL;
const targetSelector =
  process.env.DMS_PERF_TARGET_SELECTOR ?? DEFAULT_TARGET_SELECTOR;
const browserState = process.env.DMS_PERF_BROWSER_STATE;
const outputPath = resolve(process.env.DMS_PERF_OUTPUT ?? DEFAULT_OUTPUT);
let mustLoadBrowserState = Boolean(browserState);

function browser(...args) {
  const stateArgs = mustLoadBrowserState ? ["--state", browserState] : [];
  try {
    const output = execFileSync(
      "agent-browser",
      ["--session", session, ...stateArgs, ...args],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
    mustLoadBrowserState = false;
    return output;
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error.message;
    const operation = args.slice(0, 2).join(" ");
    throw new Error(`agent-browser ${operation} failed: ${detail}`, {
      cause: error,
    });
  }
}

function evaluate(script) {
  return JSON.parse(browser("eval", "--json", script)).data.result;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function waitForReady() {
  for (let attempt = 0; attempt < READY_ATTEMPTS; attempt += 1) {
    if (
      evaluate(
        `Boolean(document.querySelector(${JSON.stringify(READY_SELECTOR)}))`,
      )
    )
      return;
    browser("wait", String(READY_POLL_MS));
  }
  throw new Error(
    `Frontend did not expose ${READY_SELECTOR} within one minute`,
  );
}

function findTargetSelector() {
  return evaluate(`(() => {
    const link = [...document.querySelectorAll(${JSON.stringify(targetSelector)})]
      .find((candidate) => {
        const style = getComputedStyle(candidate);
        return candidate.getClientRects().length > 0 &&
          style.visibility !== 'hidden' && style.pointerEvents !== 'none';
      });
    if (!link) throw new Error('DMS_PERF_TARGET_SELECTOR did not match an element');
    link.dataset.dmsPerformanceTarget = 'true';
    return { selector: ${JSON.stringify(CLICK_TARGET_SELECTOR)}, targetUrl: link.href };
  })()`);
}

function openSource(iteration) {
  if (iteration === 0) {
    browser("open", sourceUrl);
    return;
  }
  evaluate("history.back()");
  browser("wait", "--fn", `location.href === ${JSON.stringify(sourceUrl)}`);
}

function summarizeHar(path) {
  const entries = JSON.parse(readFileSync(path, "utf8")).log.entries;
  const navigationEntries = entries.filter((entry) =>
    entry.request.headers.some(
      (header) => header.name.toLowerCase() === "x-inertia",
    ),
  );
  const payloadBytes = navigationEntries.reduce((sum, entry) => {
    const body = Math.max(0, entry.response.bodySize ?? 0);
    const headers = Math.max(0, entry.response.headersSize ?? 0);
    return sum + body + headers;
  }, 0);
  return { requestCount: navigationEntries.length, payloadBytes };
}

function runIteration(iteration) {
  openSource(iteration);
  waitForReady();
  browser("wait", "--load", "networkidle");
  const effectiveSourceUrl = evaluate("location.href");
  if (new URL(effectiveSourceUrl).pathname.startsWith("/auth")) {
    throw new Error(
      "Source redirected to authentication; provide an authenticated browser profile",
    );
  }
  const target = findTargetSelector();
  const harPath = `${outputPath}.${iteration}.har`;
  browser("network", "har", "start", "--content", "none");
  let durationMs;
  try {
    evaluate(`(() => {
      window.__dmsPerformanceStart = performance.now();
      window.__dmsPerformanceDone = null;
      document.addEventListener('inertia:finish', () => requestAnimationFrame(() => {
        window.__dmsPerformanceDone = performance.now();
      }), { once: true });
    })()`);
    evaluate(
      `document.querySelector(${JSON.stringify(target.selector)}).click()`,
    );
    browser(
      "wait",
      "--fn",
      `location.href === ${JSON.stringify(target.targetUrl)}`,
    );
    browser("wait", "--fn", "Number.isFinite(window.__dmsPerformanceDone)");
    durationMs = evaluate(
      "window.__dmsPerformanceDone - window.__dmsPerformanceStart",
    );
  } finally {
    browser("network", "har", "stop", harPath);
  }
  const network = summarizeHar(harPath);
  rmSync(harPath, { force: true });
  if (!Number.isFinite(durationMs)) {
    throw new Error(
      "Inertia finish event was not observed; verify the target is an Inertia link",
    );
  }
  return {
    iteration,
    effectiveSourceUrl,
    targetUrl: target.targetUrl,
    durationMs,
    ...network,
  };
}

function main() {
  mkdirSync(dirname(outputPath), { recursive: true });
  const result = {
    generatedAt: new Date().toISOString(),
    scenario: {
      sourceUrl,
      targetSelector,
      browserState: browserState ? "provided" : "agent-browser session",
      iterations: ITERATIONS,
    },
    budgets: BUDGETS,
    records: [],
  };
  try {
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      result.records.push(runIteration(iteration));
    }
    result.medians = {
      durationMs: median(result.records.map((record) => record.durationMs)),
      payloadBytes: median(result.records.map((record) => record.payloadBytes)),
      requestCount: median(result.records.map((record) => record.requestCount)),
    };
    result.passed = Object.entries(result.medians).every(
      ([metric, value]) =>
        value <= BUDGETS[`median${metric[0].toUpperCase()}${metric.slice(1)}`],
    );
  } catch (error) {
    result.passed = false;
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    try {
      browser("close");
    } catch {}
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}

main();
