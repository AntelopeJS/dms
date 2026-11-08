import assert from "node:assert/strict";
import test from "node:test";
import { newRun } from "./helpers/fake-run.mjs";
import { loadRun, saveRun } from "./run-state.mjs";
import { cliPaths } from "./launch.mjs";
import { frontendSpec } from "./stack.mjs";

await test("a run in dev mode serves its dashboard with ajs dms dev on its web port against its API, after a reload of run.json", async (t) => {
  const state = await newRun(t);
  state.frontendMode = "dev";
  state.webPort = 4321;
  saveRun(state);
  const loaded = loadRun(state.dir);
  assert.deepEqual(frontendSpec(loaded).args, [
    cliPaths(state.playground).dms,
    "dev",
    "-e",
    "docs",
    "-b",
    state.apiUrl,
    "-p",
    "4321",
  ]);
});

await test("a run without a frontend mode serves the build with ajs dms start", async (t) => {
  const state = await newRun(t);
  state.webPort = 4321;
  assert.deepEqual(frontendSpec(state).args.slice(1, 3), ["start", "-e"]);
});
