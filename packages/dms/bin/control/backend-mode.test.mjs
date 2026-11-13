import assert from "node:assert/strict";
import test from "node:test";
import { freshDatabase, restartBackend } from "./backend.mjs";
import { commandOf, newRun, served, startedOn } from "./helpers/fake-run.mjs";
import { isRunning } from "./identity.mjs";
import { loadRun, saveRun } from "./run-state.mjs";

await test("a run without --dev-backend starts its backends with ajs project start", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  assert.equal(await commandOf((await served(state)).pid), "start");
});

await test("a run started with --dev-backend runs every backend with ajs project dev, read back from run.json, and a restart keeps it", async (t) => {
  const created = await newRun(t);
  created.backendMode = "dev";
  saveRun(created);
  const state = loadRun(created.dir);
  await freshDatabase(state, "j001");
  const first = await served(state);
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  await restartBackend(state);
  const restarted = await served(state);
  assert.notEqual(restarted.pid, first.pid);
  assert.deepEqual(
    [
      await commandOf(first.pid),
      standby.command,
      await commandOf(restarted.pid),
    ],
    ["dev", "dev", "dev"],
  );
});

await test("a journey that pins dev in a production run gets a dev backend, not the production standby, and the next standby runs production again", async (t) => {
  const state = await newRun(t);
  await freshDatabase(state, "j001");
  const standby = await startedOn(`${state.databasePrefix}_j002`);
  await freshDatabase(state, "j002", { backend: "dev" });
  const pinned = await served(state);
  const next = await startedOn(`${state.databasePrefix}_j003`);
  assert.notEqual(pinned.pid, standby.pid);
  assert.equal(isRunning(standby.pid), false);
  assert.deepEqual(
    [await commandOf(pinned.pid), next.command],
    ["dev", "start"],
  );
});

await test("a restart inside a journey that pins production in a dev run keeps production", async (t) => {
  const state = await newRun(t);
  state.backendMode = "dev";
  await freshDatabase(state, "j001", { backend: "production" });
  await restartBackend(state);
  assert.equal(await commandOf((await served(state)).pid), "start");
});
