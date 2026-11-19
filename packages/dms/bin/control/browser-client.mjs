import { join } from "node:path";
import { isOutcome } from "./browser-wire.mjs";
import { decode } from "../../e2e/json.mjs";
import { isSameProcess } from "../../e2e/identity.mjs";
import { freePort, startDetached, waitForOk } from "../../e2e/processes.mjs";
import { saveRun } from "../../e2e/run-state.mjs";
import { nextFolder } from "../../e2e/session.mjs";

const READY_TIMEOUT_MS = 60_000;
const CONTROL_BIN = join(import.meta.dirname, "..", "dms-control.mjs");

/**
 * @param {import("../../e2e/run-state.mjs").RunState} state The run
 * @returns {Promise<import("../../e2e/run-state.mjs").ServerRecord>} Its running browser server, started if it was not
 */
async function browserServer(state) {
  if (state.browser && isSameProcess(state.browser)) return state.browser;
  const port = await freePort();
  const started = startDetached({
    name: "browser",
    program: process.execPath,
    args: [CONTROL_BIN, "serve-browser", state.dir, String(port)],
    cwd: state.dir,
    env: process.env,
    logs: state.logs,
  });
  state.browser = { ...started, port };
  saveRun(state);
  await waitForOk(`http://127.0.0.1:${port}/`, started, READY_TIMEOUT_MS);
  return state.browser;
}

/**
 * Runs one browser action in the run's long-lived browser, starting it on
 * first use. Each account has its own context and each tab name its own
 * page, both kept between commands. The action, the URL and the ARIA
 * snapshot go to `<run>/evidence/browser/NN-<label>/`, with a screenshot when
 * the action failed or is `screenshot`.
 *
 * @param {import("../../e2e/run-state.mjs").RunState} state The run
 * @param {Omit<import("./browser-server.mjs").BrowserRequest, "folder">} request The action: `do`, `account`, `tab`, and the action's target, value, key or path
 * @param {string} label What the step does
 * @returns {Promise<{ ok: boolean, url: string, error: string | null, aria: string, folder: string }>} The outcome
 */
export async function browserCommand(state, request, label) {
  const server = await browserServer(state);
  const folder = nextFolder(state, "browser", label);
  const outcome = await postAction(server.port, { ...request, folder });
  return { ...outcome, folder };
}

/**
 * @param {number} port The browser server's port
 * @param {import("./browser-server.mjs").BrowserRequest} request The action
 * @returns {Promise<import("../../e2e/browser.mjs").Outcome>} The server's answer
 * @throws When the answer is not an outcome
 */
export async function postAction(port, request) {
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    method: "POST",
    body: JSON.stringify(request),
  });
  /** @type {unknown} */
  const answer = await response.json();
  return decode(isOutcome, answer, "the browser server's answer", "an outcome");
}
