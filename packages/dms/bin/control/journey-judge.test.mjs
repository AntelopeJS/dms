import assert from "node:assert/strict";
import test from "node:test";
import { judge } from "./journey.mjs";

const ENDED = { error: null, abortedAt: null };
const FINDING = "dms#1: the restart never finishes";

/**
 * @param {string} name The step name
 * @param {[string, boolean][]} checks Each check's name and whether it passed
 * @returns {import("./journey.mjs").Step} The step
 */
function step(name, checks) {
  return {
    name,
    folder: `feature/journey/${name}`,
    checks: checks.map(([check, pass]) => ({
      name: check,
      pass,
      detail: "observed",
    })),
  };
}

/**
 * @param {ReturnType<typeof judge>} judged The judged journey
 * @returns {string[]} Each check as `name: verdict`
 */
function verdicts(judged) {
  return judged.steps.flatMap((entry) =>
    entry.checks.map((check) => `${check.name}: ${check.verdict}`),
  );
}

await test("a failed check the journey does not list fails it; judging it known or pass lets a regression through", () => {
  const judged = judge(
    [step("01-open", [["the page answers", false]])],
    ENDED,
    { "another check": FINDING },
  );
  assert.deepEqual(verdicts(judged), ["the page answers: fail"]);
  assert.equal(judged.status, "FAIL");
});

await test("a failed check the journey lists is known, carries its finding and passes the journey; failing it makes a known finding red forever", () => {
  const judged = judge(
    [
      step("01-open", [
        ["the page answers", false],
        ["the title shows", true],
      ]),
    ],
    ENDED,
    { "the page answers": FINDING },
  );
  assert.deepEqual(verdicts(judged), [
    "the page answers: known",
    "the title shows: pass",
  ]);
  assert.equal(judged.steps[0].checks[0].finding, FINDING);
  assert.deepEqual([judged.status, judged.error], ["PASS", null]);
});

await test("a listed check that passes is fixed and fails the journey; staying silent leaves a stale known failure that hides the next regression", () => {
  const judged = judge([step("01-open", [["the page answers", true]])], ENDED, {
    "the page answers": FINDING,
  });
  assert.deepEqual(verdicts(judged), ["the page answers: fixed"]);
  assert.equal(judged.status, "FAIL");
});

await test("an abort at a critical step whose failures are all known is the expected end; counting it as an error fails every journey with a known critical finding", () => {
  const judged = judge(
    [step("01-restart", [["the project answers again", false]])],
    { error: null, abortedAt: "01-restart" },
    { "the project answers again": FINDING },
  );
  assert.deepEqual([judged.status, judged.error], ["PASS", null]);
});

await test("an abort at a critical step with an unlisted failure stays an error; dropping it hides why the journey stopped", () => {
  const judged = judge(
    [
      step("01-restart", [
        ["the project answers again", false],
        ["the table is installed", false],
      ]),
    ],
    { error: null, abortedAt: "01-restart" },
    { "the project answers again": FINDING },
  );
  assert.equal(judged.status, "FAIL");
  assert.match(judged.error ?? "", /critical step 01-restart failed/);
});

await test("an error that is not an abort fails the journey even when every failed check is known; judging only the checks passes a journey that crashed", () => {
  const judged = judge(
    [step("01-open", [["the page answers", false]])],
    { error: "TypeError: x is undefined", abortedAt: null },
    { "the page answers": FINDING },
  );
  assert.deepEqual(
    [judged.status, judged.error],
    ["FAIL", "TypeError: x is undefined"],
  );
});
