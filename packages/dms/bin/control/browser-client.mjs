import { CONTROL_BIN } from "./stack.mjs";
import { freePort, isAlive, startDetached, waitForOk } from "./processes.mjs";
import { saveRun } from "./run-state.mjs";
import { nextFolder } from "./session.mjs";

const READY_TIMEOUT_MS = 60_000;

async function browserServer(state) {
  if (state.browser && isAlive(state.browser.pid)) return state.browser;
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
 * page, both kept between commands. The action, the URL, the ARIA snapshot
 * and a screenshot go to `<run>/evidence/browser/NN-<label>/`.
 *
 * @param {Record<string, any>} state The run
 * @param {Record<string, any>} request The action: `do`, `account`, `tab`, and the action's target, value, key or path
 * @param {string} label What the step does
 * @returns {Promise<{ ok: boolean, url: string, error: string | null, aria: string, folder: string }>} The outcome
 */
export async function browserCommand(state, request, label) {
  const server = await browserServer(state);
  const folder = nextFolder(state, "browser", label);
  const response = await fetch(`http://127.0.0.1:${server.port}/`, {
    method: "POST",
    body: JSON.stringify({ ...request, folder }),
  });
  return { ...(await response.json()), folder };
}
