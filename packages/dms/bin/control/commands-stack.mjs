import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { browserCommand } from "./browser-client.mjs";
import { ACTION_NAMES, describeTarget } from "./browser.mjs";
import { serveBrowser } from "./browser-server.mjs";
import { doctor } from "./doctor.mjs";
import { setUpFrontendWorkspace } from "./frontend-workspace.mjs";
import { capturedMail, serveMail } from "./mail.mjs";
import { loadRun, readRun } from "./run-state.mjs";
import { apiRequest, isOk, onboard } from "./session.mjs";
import { resolutionFolders } from "./launch.mjs";
import { down } from "./stack.mjs";
import { startRun } from "./start.mjs";
import { freshDatabase } from "./backend.mjs";
import { apiTargetFile, serveForwarder } from "./forwarder.mjs";
import { formatTimings, readTimings, summarize, timed } from "./timing.mjs";

/** @typedef {import("./options.mjs").Values} Values */

const BROWSER_ACTIONS = [...ACTION_NAMES, "login"];

/**
 * Writes `text` to stdout with a trailing newline.
 *
 * @param {string} text The output
 */
export function print(text) {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

/**
 * @param {Values} values
 * @returns {Promise<number>}
 */
async function commandUp(values) {
  const state = await startRun(
    {
      prepare: values.prepare,
      skill: values.skill,
      playground: values.playground,
      renderer: values.renderer,
      runs: values.runs,
      mongoUrl: values["mongo-url"],
      env: values.env,
      base: values.base,
      noStandby: values["no-standby"],
      buildCache: !values["no-build-cache"],
      frontendMode: values["dev-frontend"] ? "dev" : "build",
      backendMode: values["dev-backend"] ? "dev" : "production",
    },
    process.cwd(),
  );
  print(state.dir);
  return 0;
}

/**
 * @param {string} dir
 * @param {Values} values
 * @returns {Promise<number>}
 */
async function commandDoctor(dir, values) {
  const state = loadRun(dir);
  const lines = await doctor(state);
  writeFileSync(
    join(state.evidence, "doctor.json"),
    `${JSON.stringify(lines, null, 2)}\n`,
  );
  for (const line of lines.filter((entry) => values.verbose || !entry.ok)) {
    print(`${line.ok ? "ok  " : "FAIL"} ${line.check}: ${line.detail}`);
  }
  return lines.every((line) => line.ok) ? 0 : 1;
}

/**
 * @param {string} dir
 * @param {Values} values
 * @returns {Promise<number>}
 */
async function commandOnboard(dir, values) {
  const state = readRun(dir);
  const answer = await onboard(state, {
    platformName: values["platform-name"],
  });
  if (!isOk(answer.register) || !isOk(answer.login ?? { status: null })) {
    print(
      `onboarding failed: register ${answer.register.status} ${JSON.stringify(answer.register.body)}, login ${answer.login?.status ?? "not tried"}`,
    );
    return 1;
  }
  print(state.accounts.admin.email);
  return 0;
}

/** @param {Values} values */
function browserTarget(values) {
  if (!values.role) return undefined;
  const within = values["within-role"]
    ? { role: values["within-role"], name: values["within-name"] }
    : undefined;
  return {
    role: values.role,
    name: values.name,
    exact: values.exact,
    nth: values.nth === undefined ? undefined : Number(values.nth),
    within,
  };
}

/**
 * @param {string} dir
 * @param {string} action
 * @param {Values} values
 * @returns {Promise<number>}
 */
async function commandBrowser(dir, action, values) {
  if (!BROWSER_ACTIONS.includes(action)) {
    print(
      `Unknown browser action ${action}; expected one of ${BROWSER_ACTIONS.join(", ")}`,
    );
    return 2;
  }
  const state = loadRun(dir);
  const target = browserTarget(values);
  const request = {
    do: action,
    account: values.as ?? "admin",
    tab: values.tab ?? "main",
    target,
    value: values.value,
    key: values.key,
    path: values.path,
  };
  const label = `${values.tab ?? "main"} ${action} ${target ? describeTarget(target) : (values.path ?? "")}`;
  const outcome = await timed(
    state,
    "browser-command",
    () => browserCommand(state, request, label),
    { action },
  );
  if (!outcome.ok) {
    print(
      `FAIL ${label}: ${outcome.error} (at ${outcome.url}; evidence ${outcome.folder})`,
    );
    return 1;
  }
  if (action === "snapshot") print(outcome.aria);
  if (action === "screenshot") print(join(outcome.folder, "screenshot.png"));
  return 0;
}

/**
 * @param {string} dir
 * @param {string} method
 * @param {string} path
 * @param {Values} values
 * @returns {Promise<number>}
 */
async function commandApi(dir, method, path, values) {
  const state = readRun(dir);
  /** @type {unknown} */
  const body = values.body === undefined ? undefined : JSON.parse(values.body);
  const answer = await apiRequest(state, {
    method: method.toUpperCase(),
    path,
    body,
    as: values.as ?? "admin",
  });
  print(`${answer.status ?? answer.error}`);
  print(JSON.stringify(answer.body, null, 2) ?? "");
  return isOk(answer) ? 0 : 1;
}

/**
 * @param {string} dir
 * @returns {Promise<number>}
 */
async function commandDown(dir) {
  const state = loadRun(dir);
  const lines = await down(state);
  for (const line of lines.filter(
    (entry) => entry.startsWith("could not") || entry.startsWith("skipped"),
  ))
    print(line);
  print(state.evidence);
  return 0;
}

/**
 * Runs a command that drives the product: `up`, `doctor`, `onboard`,
 * `browser`, `api`, `mail`, `down`, `timings`, the three services `up`
 * starts, and the frontend workspace setup it runs (`prepare-frontend`).
 *
 * @param {string | undefined} command The command
 * @param {string[]} rest Its positional arguments
 * @param {Values} values Its options
 * @returns {Promise<number | undefined>} The exit code, or undefined for a command it does not own; the three services keep the process alive
 */
export async function runStackCommand(command, rest, values) {
  switch (command) {
    case "up":
      return commandUp(values);
    case "doctor":
      return commandDoctor(rest[0], values);
    case "onboard":
      return commandOnboard(rest[0], values);
    case "browser":
      return commandBrowser(rest[0], rest[1], values);
    case "api":
      return commandApi(rest[0], rest[1], rest[2], values);
    case "mail":
      print(JSON.stringify(capturedMail(readRun(rest[0]).mail), null, 2));
      return 0;
    case "down":
      return commandDown(rest[0]);
    case "timings":
      print(formatTimings(summarize(readTimings(readRun(rest[0]).evidence))));
      return 0;
    case "reset": {
      const state = loadRun(rest[0]);
      state.resetCount = (state.resetCount ?? 0) + 1;
      print(await freshDatabase(state, `r${state.resetCount}`));
      return 0;
    }
    case "prepare-frontend":
      await setUpFrontendWorkspace(
        rest[0] ?? "",
        rest[1] ?? "",
        rest[2] ?? "",
        rest[3] === "install",
      );
      return 0;
    case "serve-mail": {
      const state = loadRun(rest[0]);
      await serveMail(state.mail, state.smtpPort);
      return 0;
    }
    case "serve-api": {
      const state = loadRun(rest[0]);
      await serveForwarder(state.apiPort, apiTargetFile(state.dir));
      return 0;
    }
    case "serve-browser":
      await serveBrowser(
        rest[0],
        resolutionFolders(loadRun(rest[0])),
        Number(rest[1]),
      );
      return 0;
    default:
      return undefined;
  }
}
