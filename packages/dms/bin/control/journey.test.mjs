import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadJourneys, runJourney } from "./journey.mjs";
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
