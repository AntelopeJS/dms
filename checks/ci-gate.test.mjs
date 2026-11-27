import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedJobs, gateOffenders } from "./ci-gate.mjs";

/**
 * @param {string[]} succeeded
 * @returns {Record<string, { result: string }>}
 */
const needsOf = (succeeded) =>
  Object.fromEntries(
    ["select", "ci", ...succeeded].map((job) => [job, { result: "success" }]),
  );

const QUEUE_JOBS = [
  "backend",
  "frontend-test",
  "frontend-verify",
  "e2e",
  "formal",
  "formal-generated",
  "docs-playground",
];

await test("a queue run with every expected job passes (catches a gate that requires dependents there)", () => {
  assert.deepEqual(
    gateOffenders({
      needs: needsOf(QUEUE_JOBS),
      required: [],
      tier: "queue",
      event: "merge_group",
    }),
    [],
  );
});

await test("a queue run whose planner dropped e2e fails (catches a gate that trusts the planner's list)", () => {
  assert.deepEqual(
    gateOffenders({
      needs: needsOf(QUEUE_JOBS.filter((job) => job !== "e2e")),
      required: [],
      tier: "queue",
      event: "merge_group",
    }),
    ["e2e: missing"],
  );
});

await test("a nightly run whose dependents job was skipped fails (catches a skip counted as a pass)", () => {
  const needs = {
    ...needsOf(QUEUE_JOBS),
    dependents: { result: "skipped" },
  };
  assert.deepEqual(
    gateOffenders({ needs, required: [], tier: "nightly", event: "schedule" }),
    ["dependents: skipped"],
  );
});

await test("a fast pull request tolerates a job outside the plan (catches a gate that fails the narrowed run)", () => {
  assert.deepEqual(
    gateOffenders({
      needs: { ...needsOf(["backend"]), e2e: { result: "skipped" } },
      required: ["backend"],
      tier: "fast",
      event: "pull_request",
    }),
    [],
  );
});

await test("a fast pull request still fails a planned job that was skipped (catches the plan no longer enforced)", () => {
  assert.deepEqual(
    gateOffenders({
      needs: { ...needsOf([]), backend: { result: "skipped" } },
      required: ["backend"],
      tier: "fast",
      event: "pull_request",
    }),
    ["backend: skipped"],
  );
});

await test("a failed or cancelled job fails every tier (catches an exemption that hides a failure)", () => {
  for (const result of ["failure", "cancelled"]) {
    assert.deepEqual(
      gateOffenders({
        needs: { ...needsOf([]), docs: { result } },
        required: [],
        tier: "fast",
        event: "pull_request",
      }),
      [`docs: ${result}`],
    );
  }
});

await test("a failed ci job fails the gate (catches a gate that reads only the planned jobs)", () => {
  assert.deepEqual(
    gateOffenders({
      needs: { ...needsOf([]), ci: { result: "failure" } },
      required: [],
      tier: "none",
      event: "push",
    }),
    ["ci: failure"],
  );
});

await test("a full pull request expects no formal job, a full dispatch expects both (catches the diff-narrowed formal jobs required on a pull request)", () => {
  assert.equal(expectedJobs("full", "pull_request").includes("formal"), false);
  assert.equal(
    expectedJobs("full", "workflow_dispatch").includes("formal-generated"),
    true,
  );
});

await test("an unknown tier is held to the full table (catches a new tier that silently skips)", () => {
  assert.deepEqual(expectedJobs("surprise", "push"), [
    "backend",
    "frontend-test",
    "frontend-verify",
    "e2e",
    "formal",
    "formal-generated",
  ]);
});
