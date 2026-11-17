import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { answerRequest } from "./browser.mjs";
import { postAction } from "./browser-client.mjs";
import { isOutcome } from "./browser-wire.mjs";
import { decode } from "./json.mjs";
import { freePort } from "./processes.mjs";

const REQUEST = {
  do: "click",
  account: "admin",
  tab: "main",
  folder: "/run/evidence/browser/01-click",
  target: { role: "button", name: "Invite", nth: 1 },
};
const OUTCOME = { ok: true, url: "/", error: null, aria: "- button" };

/**
 * @param {string} body What a client posted
 * @returns {Promise<{ answer: import("./browser.mjs").Outcome, handled: unknown[] }>} The answer and the requests that reached the handler
 */
async function answered(body) {
  /** @type {unknown[]} */
  const handled = [];
  const answer = await answerRequest(body, (request) => {
    handled.push(request);
    return Promise.resolve(OUTCOME);
  });
  /** @type {unknown} */
  const posted = JSON.parse(answer);
  return {
    answer: decode(isOutcome, posted, "the answer", "an outcome"),
    handled,
  };
}

await test("a posted request reaches the handler as written and its outcome is the answer", async () => {
  const { answer, handled } = await answered(JSON.stringify(REQUEST));
  assert.deepEqual(handled, [REQUEST]);
  assert.deepEqual(answer, OUTCOME);
});

await test("a request with a field of the wrong type is answered as a failed action, not run", async () => {
  const { answer, handled } = await answered(
    JSON.stringify({ ...REQUEST, tab: 5 }),
  );
  assert.deepEqual(handled, []);
  assert.equal(answer.ok, false);
  assert.match(
    answer.error ?? "",
    /browser request is malformed: expected a browser action/,
  );
});

await test("a request without an action is answered as a failed action, not run", async () => {
  const { answer, handled } = await answered(
    JSON.stringify({ account: "admin" }),
  );
  assert.deepEqual(handled, []);
  assert.match(answer.error ?? "", /malformed: expected a browser action/);
});

await test("a body that is no JSON is answered as a failed action", async () => {
  const { answer, handled } = await answered("{");
  assert.deepEqual(handled, []);
  assert.equal(answer.ok, false);
});

/**
 * @param {import("node:test").TestContext} t The test
 * @param {unknown} answer What the server answers
 * @returns {Promise<number>} The server's port
 */
async function serving(t, answer) {
  const port = await freePort();
  const server = createServer((_incoming, outgoing) => {
    outgoing.end(JSON.stringify(answer));
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  t.after(() => server.close());
  return port;
}

await test("the client returns the server's outcome", async (t) => {
  const port = await serving(t, OUTCOME);
  assert.deepEqual(await postAction(port, REQUEST), OUTCOME);
});

await test("the client refuses an answer that is no outcome", async (t) => {
  const port = await serving(t, { ...OUTCOME, ok: "yes" });
  await assert.rejects(
    postAction(port, REQUEST),
    /the browser server's answer is malformed: expected an outcome/,
  );
});
