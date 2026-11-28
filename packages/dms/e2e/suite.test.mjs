import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { declareSuite, declaredSuite, suiteJourneys } from "./suite.mjs";
import globalSetup from "./global-setup.mjs";
import { startOptions } from "./start.mjs";

const CONFIG = `export default ${JSON.stringify({
  playground: "p",
  prepare: [],
  smoke: "smoke",
})};\n`;

/**
 * A git checkout holding two journeys configs, as dms-assistant does, with
 * the process inside its `e2e/` folder, where Playwright loads a config.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {string} The checkout root
 */
function twoSuiteCheckout(t) {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "dms-e2e-suite-")),
  );
  const cwd = process.cwd();
  const recorded = process.env.DMS_E2E_SUITE;
  const prebuilt = process.env.DMS_E2E_PREBUILT;
  delete process.env.DMS_E2E_PREBUILT;
  t.after(() => {
    process.chdir(cwd);
    if (recorded === undefined) delete process.env.DMS_E2E_SUITE;
    else process.env.DMS_E2E_SUITE = recorded;
    if (prebuilt === undefined) delete process.env.DMS_E2E_PREBUILT;
    else process.env.DMS_E2E_PREBUILT = prebuilt;
    rmSync(root, { recursive: true, force: true });
  });
  spawnSync("git", ["init", "-q"], { cwd: root });
  for (const folder of [join(root, "e2e"), join(root, "e2e", "builder")]) {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "journeys.config.ts"), CONFIG);
  }
  spawnSync("git", ["add", "-A"], { cwd: root });
  spawnSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "suites"],
    { cwd: root },
  );
  process.chdir(join(root, "e2e"));
  return root;
}

/**
 * @param {string} id The journey id
 * @param {Partial<import("./journey-load.mjs").Journey>} [fields] Its other fields
 * @returns {import("./journey-load.mjs").Journey} The journey
 */
function journey(id, fields = {}) {
  return { id, title: id, entryPoint: "/", async run() {}, ...fields };
}

await test("a suite that names the second journeys config from e2e/ starts its run on it (catches a config option resolved against the e2e/ folder)", (t) => {
  const root = twoSuiteCheckout(t);
  declareSuite({ config: "e2e/builder/journeys.config.ts" });
  const { config, frontend } = declaredSuite();
  assert.equal(config, join(root, "e2e", "builder", "journeys.config.ts"));
  assert.deepEqual(startOptions({ config, frontend }, process.cwd()), {
    prepare: true,
    config,
    frontendMode: "build",
  });
});

await test("a frontend: dev suite starts its run on the development dashboard, and a prepared one skips the prepare commands (catches a global setup that always serves a build)", (t) => {
  twoSuiteCheckout(t);
  declareSuite({ frontend: "dev" });
  const { config, frontend } = declaredSuite();
  process.env.DMS_E2E_PREBUILT = "1";
  assert.deepEqual(startOptions({ config, frontend }, process.cwd()), {
    prepare: false,
    frontendMode: "dev",
  });
});

await test("startRun resolves its config against the repository root, builds a dashboard unless told otherwise, and prepares when asked whatever DMS_E2E_PREBUILT says (catches a node:test file whose config resolves against its own folder)", (t) => {
  const root = twoSuiteCheckout(t);
  process.env.DMS_E2E_PREBUILT = "1";
  const config = "e2e/builder/journeys.config.ts";
  assert.deepEqual(startOptions({ config, prepare: true }, process.cwd()), {
    prepare: true,
    config: join(root, config),
    frontendMode: "build",
  });
});

await test('a suite option e2eConfig does not take is refused (catches a typo such as frontend: "development" silently serving a build, or a kit that still takes the verify skill)', (t) => {
  const root = twoSuiteCheckout(t);
  assert.throws(() => declareSuite({ config: "e2e/nope.config.ts" }), {
    message: `e2eConfig's config ${join(root, "e2e/nope.config.ts")} does not exist`,
  });
  for (const options of [
    { frontend: "development" },
    { frontend: "build" },
    { config: "" },
    { skill: "e2e" },
  ]) {
    assert.throws(
      () => declareSuite(options),
      /e2eConfig takes/,
      JSON.stringify(options),
    );
  }
});

await test("a build suite leaves out the journeys that need the development dashboard and a dev suite runs only those, each with the smoke feature first and last ones last (catches a suite that runs a dev journey on a built dashboard, or the smoke feature in its alphabetical place)", () => {
  const features = [
    {
      name: "a",
      journeys: [
        journey("a-1", { last: true }),
        journey("a-2"),
        journey("a-dev", { frontend: "dev" }),
      ],
    },
    {
      name: "b",
      journeys: [
        journey("b-dev", { frontend: "dev", last: true }),
        journey("b-1"),
      ],
    },
    {
      name: "smoke",
      journeys: [
        journey("smoke"),
        journey("smoke-last", { last: true }),
        journey("smoke-dev", { frontend: "dev" }),
      ],
    },
  ];
  const ids = (/** @type {"build" | "dev"} */ frontend) =>
    suiteJourneys(features, frontend, "smoke").map(
      (entry) => `${entry.feature}/${entry.journey.id}`,
    );
  assert.deepEqual(ids("build"), [
    "smoke/smoke",
    "a/a-2",
    "b/b-1",
    "smoke/smoke-last",
    "a/a-1",
  ]);
  assert.deepEqual(ids("dev"), ["smoke/smoke-dev", "a/a-dev", "b/b-dev"]);
  assert.throws(
    () =>
      suiteJourneys(
        [...features, { name: "c", journeys: [journey("b-1")] }],
        "build",
        "smoke",
      ),
    /b-1/,
  );
});

await test("a seed draws the order of the journeys not marked last, the same for the same seed, and keeps the last ones after them in their order (catches a shuffle that ignores the seed, draws a new order on each call, or moves a last journey)", () => {
  const features = [
    {
      name: "a",
      journeys: [
        ...Array.from({ length: 8 }, (_, index) => journey(`a-${index}`)),
        journey("a-last", { last: true }),
      ],
    },
    {
      name: "b",
      journeys: [journey("b-last", { last: true }), journey("b-1")],
    },
  ];
  const ids = (/** @type {string | undefined} */ seed) =>
    suiteJourneys(features, "build", "smoke", seed).map(
      (entry) => entry.journey.id,
    );
  const unshuffled = ids(undefined);
  const drawn = ids("1");
  assert.deepEqual(drawn, ids("1"));
  assert.notDeepEqual(drawn, unshuffled);
  assert.notDeepEqual(drawn, ids("2"));
  assert.deepEqual(drawn.slice(-2), ["a-last", "b-last"]);
  assert.deepEqual(drawn.toSorted(), unshuffled.toSorted());
});

await test("the global setup refuses several workers on the run DMS_E2E_RUN names (catches two workers driving one run, whose journeys would share its backend and database)", async (t) => {
  twoSuiteCheckout(t);
  const adopted = process.env.DMS_E2E_RUN;
  process.env.DMS_E2E_RUN = join(process.cwd(), "no-run");
  t.after(() => {
    if (adopted === undefined) delete process.env.DMS_E2E_RUN;
    else process.env.DMS_E2E_RUN = adopted;
  });
  declareSuite({});
  await assert.rejects(
    globalSetup({ workers: 2, webServer: null }),
    /--workers=1/,
  );
});

await test("the global setup refuses several workers when the config starts a webServer, which every worker would share (catches two workers whose journeys reset and read one mock server)", async (t) => {
  twoSuiteCheckout(t);
  declareSuite({});
  await assert.rejects(
    globalSetup({
      workers: 2,
      webServer: { command: "node mock.js", url: "http://127.0.0.1:4010" },
    }),
    /webServer.*workers: 1/,
  );
});
