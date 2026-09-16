import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_SOURCE_URL = "http://127.0.0.1:3001/form/form-simple";
const DEFAULT_TARGET_SELECTOR = 'a[href="/form/form-advanced"]';
const DEFAULT_OUTPUT = ".amp/in/artifacts/dms-frontend-runtime.json";
const HMR_BASELINE = 'const HMR_PROBE_VALUE = "baseline";';
const READY_SELECTOR = "html[data-dms-ready='true']";
const SIDEBAR_STATE = "form";
const STABILITY_WINDOW_MS = 500;
const WAIT_TIMEOUT_MS = "60000";
const session =
  process.env.DMS_RUNTIME_BROWSER_SESSION ?? `dms-runtime-${process.pid}`;
const sourceUrl = process.env.DMS_RUNTIME_SOURCE_URL ?? DEFAULT_SOURCE_URL;
const targetSelector =
  process.env.DMS_RUNTIME_TARGET_SELECTOR ?? DEFAULT_TARGET_SELECTOR;
const browserState = process.env.DMS_RUNTIME_BROWSER_STATE;
const hmrSource = process.env.DMS_RUNTIME_HMR_SOURCE;
const outputPath = resolve(process.env.DMS_RUNTIME_OUTPUT ?? DEFAULT_OUTPUT);
const sourcePath = new URL(sourceUrl).pathname;
const hmrValue = `updated-${process.pid}`;
let mustLoadBrowserState = Boolean(browserState);

function browser(...args) {
  const stateArgs = mustLoadBrowserState ? ["--state", browserState] : [];
  try {
    const output = execFileSync(
      "agent-browser",
      ["--session", session, ...stateArgs, ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    mustLoadBrowserState = false;
    return output;
  } catch (error) {
    const detail = error?.stderr?.toString().trim() || error.message;
    throw new Error(`agent-browser ${args.join(" ")} failed: ${detail}`, {
      cause: error,
    });
  }
}

function evaluate(script) {
  return JSON.parse(browser("eval", "--json", script)).data.result;
}

function waitFor(expression) {
  browser("wait", "--timeout", WAIT_TIMEOUT_MS, "--fn", expression);
}

function assertProof(proof, label) {
  const failed = Object.entries(proof)
    .filter(([, value]) => value !== true)
    .map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(`${label} failed: ${failed.join(", ")}`);
  }
}

function prepareRuntimeState() {
  evaluate(`(() => {
    const sidebar = document.querySelector('[data-dms-persistent-sidebar]');
    const sidebarSearch = document.querySelector('[data-dms-persistent-sidebar] input');
    const collapseButton = document.querySelector('[aria-label="Collapse sidebar"]');
    const pageInput = document.querySelector('[data-dms-page-region] form input');
    if (!sidebar || (!sidebarSearch && !collapseButton) || !pageInput) {
      throw new Error('State controls are unavailable');
    }
    window.__dmsInitialSidebarState = sidebarSearch
      ? sidebarSearch.value
      : sidebar.dataset.collapsed;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (sidebarSearch) {
      valueSetter?.call(sidebarSearch, ${JSON.stringify(SIDEBAR_STATE)});
      sidebarSearch.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      collapseButton.click();
    }
    valueSetter?.call(pageInput, 'hmr-state-preserved');
    pageInput.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

function waitForStablePageRegion() {
  evaluate(`window.__dmsStability = { node: null, since: 0 }`);
  waitFor(`(() => {
    const node = document.querySelector('[data-dms-page-region] form');
    if (node !== window.__dmsStability.node) {
      window.__dmsStability = { node, since: Date.now() };
      return false;
    }
    return Boolean(node) && Date.now() - window.__dmsStability.since >= ${STABILITY_WINDOW_MS};
  })()`);
}

function waitForRuntimeReady() {
  waitFor(`(() => {
    if (location.pathname !== ${JSON.stringify(sourcePath)}) return false;
    const ready = document.querySelector(${JSON.stringify(READY_SELECTOR)});
    const sidebar = document.querySelector('[data-dms-persistent-sidebar]');
    const sidebarStateControl = sidebar?.querySelector('input') ?? document.querySelector('[aria-label="Collapse sidebar"]');
    const pageInput = document.querySelector('[data-dms-page-region] form input');
    return Boolean(ready && sidebar && sidebarStateControl && pageInput);
  })()`);
}

function initializeProof() {
  return evaluate(`(() => {
    const root = document.querySelector('#app');
    const shell = document.querySelector('[data-dms-persistent-shell]');
    const sidebar = document.querySelector('[data-dms-persistent-sidebar]');
    const header = document.querySelector('[data-dms-persistent-header]');
    const region = document.querySelector('[data-dms-page-region]');
    const pageNode = region?.querySelector('form');
    const input = pageNode?.querySelector('input');
    const sidebarSearch = sidebar?.querySelector('input');
    const hmrNode = sidebar?.querySelector('[data-dms-hmr-probe]');
    if (!root || !shell || !sidebar || !header || !region || !pageNode || !input || !hmrNode) {
      throw new Error('Runtime proof selectors are incomplete');
    }
    window.__dmsRuntimeProof = {
      root,
      shell,
      sidebar,
      header,
      region,
      pageNode,
      input,
      sidebarState: sidebarSearch
        ? { kind: 'input', node: sidebarSearch, value: sidebarSearch.value }
        : { kind: 'collapsed', value: sidebar.dataset.collapsed },
      styleNodes: [...document.querySelectorAll('link[rel="stylesheet"], style')],
      navigationCount: performance.getEntriesByType('navigation').length,
      sourcePath: location.pathname,
      sourceTitle: document.title,
    };
    return {
      path: location.pathname,
      title: document.title,
      styleNodeCount: window.__dmsRuntimeProof.styleNodes.length,
    };
  })()`);
}

function updateHmrSource(source) {
  if (!source.includes(HMR_BASELINE)) {
    throw new Error(`HMR probe marker missing from ${hmrSource}`);
  }
  writeFileSync(
    hmrSource,
    source.replace(HMR_BASELINE, `const HMR_PROBE_VALUE = "${hmrValue}";`),
  );
}

function hmrProof() {
  return evaluate(`(() => {
    const proof = window.__dmsRuntimeProof;
    return {
      rootPreserved: document.querySelector('#app') === proof.root,
      shellPreserved: document.querySelector('[data-dms-persistent-shell]') === proof.shell,
      sidebarPreserved: document.querySelector('[data-dms-persistent-sidebar]') === proof.sidebar,
      headerPreserved: document.querySelector('[data-dms-persistent-header]') === proof.header,
      regionPreserved: document.querySelector('[data-dms-page-region]') === proof.region,
      pageStatePreserved: proof.pageNode.isConnected && proof.input.value === 'hmr-state-preserved',
      activePagePreserved: document.querySelector('[data-dms-page-region] form') === proof.pageNode,
      activeInputPreserved: document.querySelector('[data-dms-page-region] form input') === proof.input,
      sidebarStatePreserved: proof.sidebarState.kind === 'input'
        ? proof.sidebarState.node.value === proof.sidebarState.value
        : proof.sidebar.dataset.collapsed === proof.sidebarState.value,
      sidebarStateChanged: proof.sidebarState.value !== window.__dmsInitialSidebarState,
      noFullReload: performance.getEntriesByType('navigation').length === proof.navigationCount,
      markerUpdated: document.querySelector('[data-dms-hmr-probe]')?.dataset.dmsHmrProbe === ${JSON.stringify(hmrValue)},
    };
  })()`);
}

function navigateForward() {
  return evaluate(`(async () => {
    if (!document.querySelector(${JSON.stringify(targetSelector)})) {
      document.querySelector('[aria-label="Expand sidebar"]')?.click();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const proof = window.__dmsRuntimeProof;
      if (proof.sidebarState.kind === 'collapsed') {
        proof.sidebarState.value = proof.sidebar.dataset.collapsed;
      }
    }
    const link = document.querySelector(${JSON.stringify(targetSelector)});
    if (!link) throw new Error('Target Inertia link is unavailable');
    const targetUrl = link.href;
    link.click();
    return targetUrl;
  })()`);
}

function navigationProof() {
  return evaluate(`(() => {
    const proof = window.__dmsRuntimeProof;
    return {
      rootPreserved: document.querySelector('#app') === proof.root,
      shellPreserved: document.querySelector('[data-dms-persistent-shell]') === proof.shell,
      sidebarPreserved: document.querySelector('[data-dms-persistent-sidebar]') === proof.sidebar,
      headerPreserved: document.querySelector('[data-dms-persistent-header]') === proof.header,
      regionPreserved: document.querySelector('[data-dms-page-region]') === proof.region,
      pageSubtreeChanged: !proof.pageNode.isConnected,
      sidebarStatePreserved: proof.sidebarState.kind === 'input'
        ? proof.sidebarState.node.value === proof.sidebarState.value
        : proof.sidebar.dataset.collapsed === proof.sidebarState.value,
      existingCssPreserved: proof.styleNodes.every(node => node.isConnected),
      styleNodeCountUnchanged: document.querySelectorAll('link[rel="stylesheet"], style').length === proof.styleNodes.length,
      headChanged: document.title !== proof.sourceTitle,
      noFullReload: performance.getEntriesByType('navigation').length === proof.navigationCount,
      pathChanged: location.pathname !== proof.sourcePath,
    };
  })()`);
}

function backProof() {
  return evaluate(`(() => {
    const proof = window.__dmsRuntimeProof;
    return {
      rootPreserved: document.querySelector('#app') === proof.root,
      shellPreserved: document.querySelector('[data-dms-persistent-shell]') === proof.shell,
      sidebarPreserved: document.querySelector('[data-dms-persistent-sidebar]') === proof.sidebar,
      headerPreserved: document.querySelector('[data-dms-persistent-header]') === proof.header,
      regionPreserved: document.querySelector('[data-dms-page-region]') === proof.region,
      forwardPageDisconnected: Boolean(proof.forwardPageNode) && !proof.forwardPageNode.isConnected,
      sidebarStatePreserved: proof.sidebarState.kind === 'input'
        ? proof.sidebarState.node.value === proof.sidebarState.value
        : proof.sidebar.dataset.collapsed === proof.sidebarState.value,
      existingCssPreserved: proof.styleNodes.every(node => node.isConnected),
      styleNodeCountUnchanged: document.querySelectorAll('link[rel="stylesheet"], style').length === proof.styleNodes.length,
      headRestored: document.title === proof.sourceTitle,
      pathRestored: location.pathname === proof.sourcePath,
      noFullReload: performance.getEntriesByType('navigation').length === proof.navigationCount,
    };
  })()`);
}

function run() {
  if (!hmrSource) throw new Error("DMS_RUNTIME_HMR_SOURCE is required");
  const originalSource = readFileSync(hmrSource, "utf8");
  const result = { sourceUrl, targetSelector, hmrSource, passed: false };
  try {
    browser("open", sourceUrl);
    waitForRuntimeReady();
    prepareRuntimeState();
    waitForStablePageRegion();
    result.initial = initializeProof();
    updateHmrSource(originalSource);
    waitFor(
      `document.querySelector('[data-dms-hmr-probe]')?.dataset.dmsHmrProbe === ${JSON.stringify(hmrValue)}`,
    );
    result.hmr = hmrProof();
    assertProof(result.hmr, "HMR");
    const targetUrl = navigateForward();
    waitFor(
      `location.href === ${JSON.stringify(targetUrl)} && !window.__dmsRuntimeProof.pageNode.isConnected`,
    );
    result.forward = navigationProof();
    assertProof(result.forward, "Inertia forward navigation");
    evaluate(
      "Boolean(window.__dmsRuntimeProof.forwardPageNode = document.querySelector('[data-dms-page-region]')?.lastElementChild)",
    );
    evaluate("history.back()");
    waitFor(
      "location.pathname === window.__dmsRuntimeProof.sourcePath && document.title === window.__dmsRuntimeProof.sourceTitle && Boolean(document.querySelector('[data-dms-page-region] form'))",
    );
    result.back = backProof();
    assertProof(result.back, "Inertia history navigation");
    result.passed = true;
  } finally {
    writeFileSync(hmrSource, originalSource);
    try {
      waitFor(
        `document.querySelector('[data-dms-hmr-probe]')?.dataset.dmsHmrProbe === 'baseline'`,
      );
    } catch {}
    try {
      browser("close");
    } catch {}
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
}

run();
