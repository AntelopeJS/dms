const assert = require("node:assert/strict");
const test = require("node:test");
const { getErrorMessage } = require("../dist/base/types/error");

test("getErrorMessage returns the message of an error carrying a string message", () => {
  assert.equal(getErrorMessage(new Error("boom")), "boom");
  assert.equal(getErrorMessage({ message: "plain" }), "plain");
});

test("getErrorMessage uses the fallback for a non-string message instead of returning it as-is (fails an implementation that trusts isErrorWithMessage alone)", () => {
  for (const message of [7, null, undefined, {}, ["x"], true]) {
    assert.equal(getErrorMessage({ message }), "Unknown error");
  }
});

test("getErrorMessage uses the fallback for values without a message", () => {
  for (const value of [null, undefined, "text", 3, {}]) {
    assert.equal(getErrorMessage(value), "Unknown error");
  }
});
