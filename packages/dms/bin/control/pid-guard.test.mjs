import assert from "node:assert/strict";
import test from "node:test";
import { assertSignalable, isAlive, stopAll } from "./processes.mjs";

const UNSAFE = [-1, 0, 1, undefined, Number.NaN, 2.5, "1234", null];

/**
 * Replaces `process.kill` with a recorder for the test, so a regression in
 * the guard records a call instead of signalling every process of the user.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {unknown[][]} The calls `process.kill` received
 */
function recordKills(t) {
  /** @type {unknown[][]} */
  const calls = [];
  const original = process.kill.bind(process);
  process.kill = (...args) => {
    calls.push(args);
    return true;
  };
  t.after(() => {
    process.kill = original;
  });
  return calls;
}

await test("stopAll throws on a pid that is not a whole number above 1 before sending any signal; a guard after the first kill lets kill(-1) reach every process of the user", async (t) => {
  const calls = recordKills(t);
  for (const pid of UNSAFE) {
    await assert.rejects(stopAll([pid]), TypeError, String(pid));
  }
  assert.deepEqual(calls, []);
});

await test("assertSignalable accepts a real process id and refuses the rest; a guard that only rejects -1 still lets 0 signal the caller's own group", () => {
  assert.doesNotThrow(() => assertSignalable(process.pid));
  for (const pid of UNSAFE) {
    assert.throws(() => assertSignalable(pid), TypeError, String(pid));
  }
});

await test("isAlive answers false for those values without probing; probing kill(-1, 0) reports some process alive", (t) => {
  const calls = recordKills(t);
  for (const pid of UNSAFE) {
    assert.equal(isAlive(pid), false, String(pid));
  }
  assert.deepEqual(calls, []);
});
