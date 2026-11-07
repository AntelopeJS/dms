import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  JourneyContext,
  loadJourneys,
  runJourney,
  runJourneyFile,
} from "./journey.mjs";
import { Tab } from "./tab.mjs";
import { readTimings } from "./timing.mjs";

const JOURNEY = '{ id: "smoke", title: "t", entryPoint: "e", async run() {} }';

/**
 * @param {import("node:test").TestContext} t The test
 * @param {string} source The module source
 * @returns {string} The journeys module
 */
function journeysModule(t, source) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-journey-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "journeys.mjs");
  writeFileSync(file, source);
  return file;
}

await test("a module exporting well-formed journeys loads them", async (t) => {
  const file = journeysModule(
    t,
    `export const journeys = [${JOURNEY}, { id: "b", title: "t", entryPoint: "e", database: "fresh", onboard: false, async run() {} }];`,
  );
  const journeys = await loadJourneys(file);
  assert.deepEqual(
    journeys.map((journey) => journey.id),
    ["smoke", "b"],
  );
});

await test("a module without a journeys array is refused", async (t) => {
  await assert.rejects(
    loadJourneys(journeysModule(t, "export const journeys = {};")),
    /exports no journeys array/,
  );
  await assert.rejects(
    loadJourneys(journeysModule(t, "export const other = [];")),
    /exports no journeys array/,
  );
});

await test("a journey missing a field a run reads is refused", async (t) => {
  const broken = [
    '{ title: "t", entryPoint: "e", async run() {} }',
    '{ id: "x", title: "t", entryPoint: "e" }',
    '{ id: "x", title: "t", entryPoint: "e", database: 3, async run() {} }',
    '{ id: "x", title: "t", entryPoint: "e", onboard: "yes", async run() {} }',
    "null",
  ];
  for (const journey of broken) {
    await assert.rejects(
      loadJourneys(journeysModule(t, `export const journeys = [${journey}];`)),
      /exports a journey without an id/,
      journey,
    );
  }
});

await test("a journey whose browser fails to launch still records its journey entry, failed; recording it only after a normal return leaves the run's total blind to it", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-journey-timing-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const evidence = join(dir, "evidence");
  mkdirSync(evidence);
  const previous = process.env.PLAYWRIGHT_BROWSERS_PATH;
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(dir, "no-browsers");
  t.after(() => {
    if (previous === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
    else process.env.PLAYWRIGHT_BROWSERS_PATH = previous;
  });
  const state = {
    dir,
    evidence,
    playground: dir,
    moduleRoot: dir,
    accounts: {},
  };
  const journey = {
    id: "j1",
    title: "t",
    entryPoint: "e",
    database: "shared",
    onboard: false,
    async run() {},
  };
  await assert.rejects(runJourney(state, "feat", journey, {}));
  const entry = readTimings(evidence).find((line) => line.phase === "journey");
  assert.deepEqual(entry && [entry.ok, entry.feature, entry.journey], [
    false,
    "feat",
    "j1",
  ]);
});

await test("a run whose backend holds the API port itself is refused before its journeys load", async (t) => {
  const old = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    stdio: "ignore",
  });
  t.after(() => old.kill());
  assert.ok(old.pid !== undefined && old.pid > 1, "the old backend started");
  const state = {
    apiPort: 5010,
    processes: [{ name: "backend", pid: old.pid, port: 5010 }],
  };
  await assert.rejects(
    runJourneyFile(state, {
      file: journeysModule(t, `export const journeys = [${JOURNEY}];`),
      feature: "smoke",
      ids: [],
      skill: { config: {} },
    }),
    { message: "this run was started by an older dms-control; run `up` again" },
  );
});

/**
 * A page whose documents the server rendered for a Vue app, which hydrates
 * each one `now` (on load), `later` (parsed a few milliseconds after load,
 * mounted a few more after that) or `never`; with `none` its documents have
 * no server-rendered root, as a JSON answer. The first `networkChanges`
 * loads, and every click with `networkChangeOnClick`, see a request fail
 * with `net::ERR_NETWORK_CHANGED` and leave a page that never hydrates. A
 * `waitForFunction` whose expression cannot come to hold gives up at once, as
 * Playwright does once its timeout passes.
 *
 * @param {string} url The URL the page reports
 * @param {{ failGoto?: boolean, hydration?: "now" | "later" | "never" | "none", networkChanges?: number, networkChangeOnClick?: boolean }} [options] Whether navigation throws, how the page hydrates, and which loads and clicks a network change disturbs
 * @returns {{ page: object, shots: string[], inputs: { input: string, hydrated: boolean }[], load: () => void, loads: () => number, hydrated: () => boolean, giveUps: () => number }} The page, the paths it was asked to screenshot, the input it received and whether it had hydrated then, a way to load a new document into it, how many documents it loaded, whether its document has hydrated, and how many waits ran into their timeout
 */
function fakePage(url, options = {}) {
  const hydration = options.hydration ?? "now";
  let giveUps = 0;
  let loads = 0;
  let networkChanges = options.networkChanges ?? 0;
  /** @type {((request: object) => void)[]} */
  let listeners = [];
  const networkChange = () => {
    const request = {
      failure: () => ({ errorText: "net::ERR_NETWORK_CHANGED" }),
    };
    for (const listener of listeners) listener(request);
  };
  /** @type {string[]} */
  const shots = [];
  /** @type {{ input: string, hydrated: boolean }[]} */
  const inputs = [];
  let readyState = "complete";
  /** @type {{ __vue_app__?: object }[]} */
  let roots = [];
  let pending = false;
  const mounted = () =>
    readyState !== "loading" && roots.every((root) => "__vue_app__" in root);
  const load = () => {
    loads += 1;
    if (hydration === "none") return;
    /** @type {{ __vue_app__?: object }} */
    const root = {};
    if (networkChanges > 0) {
      networkChanges -= 1;
      roots = [root];
      networkChange();
      return;
    }
    if (hydration !== "later") {
      roots = [root];
      if (hydration === "now") root.__vue_app__ = {};
      return;
    }
    readyState = "loading";
    roots = [];
    pending = true;
    setTimeout(() => {
      readyState = "interactive";
      roots = [root];
    }, 5);
    setTimeout(() => {
      root.__vue_app__ = {};
      pending = false;
    }, 25);
  };
  const done = async () => undefined;
  /** @param {string} input The input */
  const receive = (input) => async () => {
    inputs.push({ input, hydrated: mounted() });
    if (input !== "click" || !options.networkChangeOnClick) return;
    roots = [{}];
    networkChange();
  };
  const control = {
    fill: receive("fill"),
    click: receive("click"),
    waitFor: done,
  };
  const page = {
    url: () => url,
    goto: async () => {
      if (options.failGoto) throw new Error("net::ERR_CONNECTION_REFUSED");
      load();
    },
    getByRole: () => control,
    on: (
      /** @type {string} */ _event,
      /** @type {(request: object) => void} */ listener,
    ) => {
      listeners.push(listener);
    },
    off: (
      /** @type {string} */ _event,
      /** @type {(request: object) => void} */ listener,
    ) => {
      listeners = listeners.filter((other) => other !== listener);
    },
    waitForURL: done,
    waitForLoadState: done,
    waitForTimeout: done,
    waitForFunction: async (
      /** @type {string} */ expression,
      /** @type {unknown} */ _arg,
      /** @type {{ polling: number }} */ { polling },
    ) => {
      const document = () => ({
        readyState,
        querySelectorAll: (/** @type {string} */ selector) =>
          selector === "[data-server-rendered]" ? roots : [{}, ...roots],
      });
      while (!runInNewContext(expression, { document: document() })) {
        if (!pending) {
          giveUps += 1;
          throw new Error("page.waitForFunction: Timeout");
        }
        await new Promise((resolve) => setTimeout(resolve, polling));
      }
    },
    locator: () => ({ ariaSnapshot: async () => "- document" }),
    screenshot: async (/** @type {{ path: string }} */ { path }) => {
      shots.push(path);
    },
  };
  return {
    page,
    shots,
    inputs,
    load,
    loads: () => loads,
    hydrated: mounted,
    giveUps: () => giveUps,
  };
}

/**
 * @param {import("node:test").TestContext} t The test
 * @returns {JourneyContext} A journey context over a scratch evidence folder, with an `admin` account
 */
function journeyContext(t) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-evidence-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return new JourneyContext(
    {
      evidence: dir,
      webUrl: "http://web",
      accounts: { admin: { email: "a@verify.local", password: "pw" } },
    },
    "feature",
    "journey",
    null,
    null,
  );
}

/**
 * @param {JourneyContext} context The journey
 * @param {string} shot A screenshot path
 * @returns {string} The step folder the screenshot is in, relative to the evidence
 */
function stepOf(context, shot) {
  return relative(context.state.evidence, dirname(shot));
}

await test("a succeeding action writes no screenshot", async (t) => {
  const context = journeyContext(t);
  const { page, shots } = fakePage("http://web/");
  const outcome = await new Tab(context, page, "admin").goto("/");
  assert.equal(outcome.ok, true);
  assert.deepEqual(shots, []);
});

await test("a failing action writes a screenshot into its own step folder", async (t) => {
  const context = journeyContext(t);
  const { page, shots } = fakePage("http://web/", { failGoto: true });
  await assert.rejects(
    new Tab(context, page, "admin").goto("/"),
    /critical step/,
  );
  assert.deepEqual(
    shots.map((shot) => stepOf(context, shot)),
    [context.steps[0].folder],
  );
});

await test("a snapshot step and the screenshot action write one screenshot each", async (t) => {
  const context = journeyContext(t);
  const { page, shots } = fakePage("http://web/");
  const tab = new Tab(context, page, "admin");
  const snapshot = await tab.snapshot("record the page");
  const explicit = await tab.act({ do: "screenshot" }, "look");
  assert.deepEqual(
    shots.map((shot) => stepOf(context, shot)),
    [snapshot, explicit].map((outcome) =>
      relative(context.state.evidence, outcome.folder),
    ),
  );
});

await test("a verify step writes one screenshot of the tab driven last, whatever the checks say", async (t) => {
  const context = journeyContext(t);
  const first = fakePage("http://web/first");
  const second = fakePage("http://web/second");
  const firstTab = new Tab(context, first.page, "first");
  await firstTab.goto("/first");
  await new Tab(context, second.page, "second").goto("/second");
  await context.verify("passes", [context.holds("true", true, "")]);
  await context.verify("fails", [context.holds("false", false, "")]);
  assert.deepEqual(first.shots, []);
  assert.deepEqual(
    second.shots.map((shot) => stepOf(context, shot)),
    context.steps.slice(2).map((step) => step.folder),
  );
  await firstTab.goto("/again");
  await context.verify("back on the first tab", []);
  assert.equal(first.shots.length, 1);
  assert.equal(second.shots.length, 2);
});

await test("a verify step before any tab was driven writes no screenshot and still records", async (t) => {
  const context = journeyContext(t);
  const passed = await context.verify("api only", [
    context.holds("true", true, ""),
  ]);
  assert.equal(passed, true);
  assert.equal(context.steps.length, 1);
});

await test("signing in writes no screenshot and makes its tab the one a verify step shows", async (t) => {
  const context = journeyContext(t);
  const other = fakePage("http://web/other");
  await new Tab(context, other.page, "other").goto("/other");
  const admin = fakePage("http://web/home");
  const outcome = await new Tab(context, admin.page, "admin").signIn("admin");
  assert.equal(outcome.ok, true);
  assert.deepEqual(admin.shots, []);
  await context.verify("signed in", [context.holds("true", true, "")]);
  assert.equal(admin.shots.length, 1);
  assert.deepEqual(other.shots, []);
});

await test("input reaches a page only once it has parsed and hydrated, a document that starts loading after the previous action included", async (t) => {
  const context = journeyContext(t);
  const fake = fakePage("http://web/members", { hydration: "later" });
  const tab = new Tab(context, fake.page, "admin");
  await tab.goto("/members");
  assert.equal(
    fake.hydrated(),
    true,
    "a navigation ends once its page has hydrated",
  );
  await tab.click({ role: "button", name: "Invite members" });
  fake.load();
  await tab.fill(
    { role: "textbox", name: "Email addresses" },
    "a@verify.local",
  );
  assert.deepEqual(fake.inputs, [
    { input: "click", hydrated: true },
    { input: "fill", hydrated: true },
  ]);
});

await test("a page with no server-rendered root takes input without waiting for a hydration", async (t) => {
  const context = journeyContext(t);
  const fake = fakePage("http://web/api/unknown", { hydration: "none" });
  const tab = new Tab(context, fake.page, "admin");
  await tab.goto("/api/unknown");
  await tab.click({ role: "button", name: "Retry" });
  assert.equal(fake.inputs.length, 1);
  assert.equal(fake.giveUps(), 0);
});

await test("a page that never hydrates still gets the action, which succeeds or fails on its own", async (t) => {
  const context = journeyContext(t);
  const fake = fakePage("http://web/members", { hydration: "never" });
  const tab = new Tab(context, fake.page, "admin");
  await tab.goto("/members");
  const outcome = await tab.click({ role: "button", name: "Invite members" });
  assert.equal(outcome.ok, true);
  assert.deepEqual(fake.inputs, [{ input: "click", hydrated: false }]);
});

await test("a sign-in that stays on /auth writes a screenshot into its last step folder", async (t) => {
  const context = journeyContext(t);
  const fake = fakePage("http://web/auth");
  await assert.rejects(
    new Tab(context, fake.page, "admin").signIn("admin"),
    /critical step .*signed-in-as-admin failed/,
  );
  assert.equal(fake.shots.length, 1);
  assert.match(
    stepOf(context, fake.shots[0]),
    /\/\d+-admin-sign-in-click-login$/,
  );
});

await test("a page load that a network change left unhydrated is loaded once more", async (t) => {
  const context = journeyContext(t);
  const fake = fakePage("http://web/members", { networkChanges: 1 });
  const tab = new Tab(context, fake.page, "admin");
  await tab.goto("/members");
  await tab.click({ role: "button", name: "Invite members" });
  assert.equal(fake.loads(), 2);
  assert.deepEqual(fake.inputs, [{ input: "click", hydrated: true }]);
});

await test("a page load that network changes keep breaking is loaded twice at most, then left to its action", async (t) => {
  const context = journeyContext(t);
  const fake = fakePage("http://web/members", { networkChanges: 3 });
  const outcome = await new Tab(context, fake.page, "admin").goto("/members");
  assert.equal(outcome.ok, true);
  assert.equal(fake.loads(), 2);
});

await test("a click is never repeated, whatever a network change did meanwhile", async (t) => {
  const context = journeyContext(t);
  const fake = fakePage("http://web/members", { networkChangeOnClick: true });
  const tab = new Tab(context, fake.page, "admin");
  await tab.goto("/members");
  fake.load();
  await tab.click({ role: "button", name: "Send invitations" });
  assert.equal(fake.inputs.length, 1);
});
