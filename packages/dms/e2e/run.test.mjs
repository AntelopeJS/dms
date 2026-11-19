import assert from "node:assert/strict";
import test from "node:test";
import { isSameProcess } from "./identity.mjs";
import { apiRequest, onboard, startRun } from "./run.mjs";
import { loadRun, recordedBackends } from "./run-state.mjs";
import { down } from "./stack.mjs";

const SKILL = ".agents/skills/verify-dms";

await test("a node:test file starts the checkout's playground, calls its backend anonymously and as the onboarded administrator, and leaves no process once it stops (catches a stop that leaves the backend, the mail sink or mongod running)", async (t) => {
  const { run, stop } = await startRun({ skill: SKILL, prepare: false });
  t.after(async () => {
    await down(loadRun(run.dir));
  });

  const before = await apiRequest(run, {
    method: "GET",
    path: "/api/onboarding/informations",
    as: "anon",
  });
  assert.equal(before.status, 200, JSON.stringify(before.body));
  assert.deepEqual(before.body, { has_onboarded: false });

  const admin = await onboard(run, {});
  assert.equal(admin.register.status, 200, JSON.stringify(admin.register));
  assert.equal(admin.login?.status, 200, JSON.stringify(admin.login));
  const after = await apiRequest(run, {
    method: "GET",
    path: "/api/onboarding/informations",
    as: "admin",
  });
  assert.deepEqual(after.body, { has_onboarded: true });

  const started = [
    ...new Map(
      [...loadRun(run.dir).processes, ...recordedBackends(run.dir)].map(
        (entry) => [entry.pid, entry],
      ),
    ).values(),
  ];
  assert.ok(
    started.some((entry) => entry.name === "backend"),
    "the run recorded its backend",
  );
  await stop();
  assert.deepEqual(
    started.filter(isSameProcess).map((entry) => `${entry.name} ${entry.pid}`),
    [],
  );
});
