import assert from "node:assert/strict";
import test from "node:test";
import { runModes } from "./commands-stack.mjs";
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

await test("up --dev-frontend runs its backends with ajs project dev, as the dev dashboard expects, and a build dashboard keeps production unless --dev-backend", () => {
  assert.deepEqual(
    [
      runModes({ "dev-frontend": true }),
      runModes({}),
      runModes({ "dev-backend": true }),
    ],
    [
      { frontendMode: "dev", backendMode: "dev" },
      { frontendMode: "build", backendMode: "production" },
      { frontendMode: "build", backendMode: "dev" },
    ],
  );
});
