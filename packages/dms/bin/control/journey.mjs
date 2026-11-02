import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { withBaseBackend } from "./base.mjs";
import { launchBrowser, newContext } from "./browser.mjs";
import { capturedMail } from "./mail.mjs";
import { isRecord, isString, readRecordList } from "./json.mjs";
import { saveRun } from "./run-state.mjs";
import {
  adminCredentials,
  apiRequest,
  newPassword,
  onboard,
  recordedRequest,
} from "./session.mjs";
import {
  ensureMail,
  freshDatabase,
  resolutionFolders,
  restartBackend,
} from "./stack.mjs";
import { Tab } from "./tab.mjs";

/**
 * @typedef {{ name: string, pass: boolean, detail: string }} Check
 * @typedef {ReturnType<typeof capturedMail>[number]} CapturedMail
 * @typedef {import("./verify/types.mjs").FeatureResult} FeatureResult
 * @typedef {{ id: string, title: string, entryPoint: string, database?: string, onboard?: boolean, run: (context: JourneyContext) => Promise<void> }} Journey
 * @typedef {{ name: string, folder: string, checks: Check[] }} Step
 */

const EXPECT_TIMEOUT_MS = 15_000;
const POLL_MS = 250;
const DETAIL_LENGTH = 300;
const UNIQUE_BYTES = 3;

class JourneyAbort extends Error {}

/**
 * @param {string} text The text
 * @returns {string} The text as a folder name
 */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * @param {string} file The file
 * @param {unknown} value The value
 */
function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * An equality check over JSON-serialisable values.
 *
 * @param {string} name What is compared
 * @param {unknown} actual The value found
 * @param {unknown} expected The value wanted
 * @returns {Check} The check
 */
function equal(name, actual, expected) {
  const [left, right] = [JSON.stringify(actual), JSON.stringify(expected)];
  return {
    name,
    pass: left === right,
    detail: `expected ${right}, got ${left}`,
  };
}

/**
 * A check that an API answer has `expected` as its status.
 *
 * @param {Pick<import("./session.mjs").ApiAnswer, "status" | "body">} answer The answer
 * @param {number} expected The status wanted
 * @returns {Check} The check
 */
function status(answer, expected) {
  const body = JSON.stringify(answer.body) ?? "";
  return {
    name: `HTTP ${expected}`,
    pass: answer.status === expected,
    detail: `status ${answer.status}: ${body.slice(0, DETAIL_LENGTH)}`,
  };
}

/**
 * A check that a condition holds, with what was observed.
 *
 * @param {string} name What is checked
 * @param {unknown} pass Whether it holds
 * @param {unknown} detail What was observed
 * @returns {Check} The check
 */
function holds(name, pass, detail) {
  return { name, pass: Boolean(pass), detail: String(detail) };
}

/**
 * What a journey drives the run through: tabs per account, the API as an
 * account, the captured mail, and checks recorded into numbered step
 * folders under `<run>/evidence/<feature>/<journey>/`.
 */
export class JourneyContext {
  /**
   * @param {import("./run-state.mjs").RunState} state The run
   * @param {string} feature The feature the journey belongs to
   * @param {string} journey The journey id
   * @param {import("playwright-core").Browser} browser The Playwright browser
   * @param {import("./verify/skill.mjs").Skill} skill The skill the journey belongs to
   */
  constructor(state, feature, journey, browser, skill) {
    this.state = state;
    this.skill = skill;
    this.feature = feature;
    this.journey = journey;
    this.browser = browser;
    this.folder = join(state.evidence, feature, journey);
    /** @type {Step[]} */
    this.steps = [];
    /** @type {Map<string, import("playwright-core").BrowserContext>} */
    this.contexts = new Map();
    this.index = 0;
    this.startedAt = new Date().toISOString();
    this.equal = equal;
    this.status = status;
    this.holds = holds;
    rmSync(this.folder, { recursive: true, force: true });
    mkdirSync(this.folder, { recursive: true });
  }

  /**
   * A new numbered step folder.
   *
   * @param {string} label What the step does
   * @returns {string} The step folder
   */
  step(label) {
    this.index += 1;
    const name = `${String(this.index).padStart(2, "0")}-${slug(label)}`;
    const folder = join(this.folder, name);
    mkdirSync(folder, { recursive: true });
    return folder;
  }

  /**
   * Records the checks of a step folder; a failed critical step ends the journey.
   *
   * @param {string} folder The step folder
   * @param {{ name: string, pass: boolean, detail: string }[]} checks The checks
   * @param {{ critical?: boolean }} [options] Whether a failure ends the journey
   * @returns {boolean} Whether every check passed
   */
  record(folder, checks, options = {}) {
    this.steps.push({
      name: relative(this.folder, folder),
      folder: relative(this.state.evidence, folder),
      checks,
    });
    writeJson(join(folder, "checks.json"), checks);
    const passed = checks.every((check) => check.pass);
    if (!passed && options.critical) {
      throw new JourneyAbort(
        `critical step ${relative(this.folder, folder)} failed`,
      );
    }
    return passed;
  }

  /**
   * Records a step of checks, which may be promises (`tab.visible(...)`).
   * With `{ critical: true }` a failure ends the journey.
   *
   * @param {string} label What the step verifies
   * @param {(Check | Promise<Check>)[]} checks The checks, or promises of them
   * @param {{ critical?: boolean }} [options] Whether a failure ends the journey
   * @returns {Promise<boolean>} Whether every check passed
   */
  async verify(label, checks, options = {}) {
    return this.record(
      this.step(label),
      await Promise.all(checks.map((check) => Promise.resolve(check))),
      options,
    );
  }

  /**
   * A new tab as `account` (`anon` for nobody), in that account's own browser context.
   *
   * @param {string} [account] The account, or `anon`
   * @param {string} [label] The tab's name in evidence
   * @returns {Promise<Tab>} The tab
   */
  async tab(account = "admin", label = account) {
    if (!this.contexts.has(account)) {
      this.contexts.set(account, await newContext(this.browser));
    }
    return new Tab(this, await this.contexts.get(account).newPage(), label);
  }

  /**
   * Calls the backend as `as` (an account, or `anon`; `admin` by default),
   * or with an explicit `token` and no retry, and records the exchange.
   *
   * @param {string} label What the call does
   * @param {{ method: string, path: string, body?: unknown, as?: string, token?: string }} request What to send and as whom
   * @returns {Promise<import("./session.mjs").ApiAnswer & { folder?: string }>} The answer
   */
  api(label, request) {
    if (request.token) {
      return recordedRequest(this.step(`api ${label}`), {
        ...request,
        url: `${this.state.apiUrl}${request.path}`,
      });
    }
    return apiRequest(this.state, {
      ...request,
      as: request.as ?? "admin",
      folder: () => this.step(`api ${label}`),
    });
  }

  /**
   * Sends anonymous requests at once, for races, each recorded in its own step folder.
   *
   * @param {string} label What the calls do
   * @param {{ method: string, path: string, body?: unknown, token?: string }[]} requests What to send
   * @returns {Promise<import("./session.mjs").ApiAnswer[]>} The answers
   */
  concurrent(label, requests) {
    return Promise.all(
      requests.map((request, index) =>
        recordedRequest(this.step(`${label} ${index + 1}`), {
          ...request,
          url: `${this.state.apiUrl}${request.path}`,
        }),
      ),
    );
  }

  /**
   * Adds an account the journey created (an invited member) so tabs and the API can act as it.
   *
   * @param {string} name The account name
   * @param {import("./run-state.mjs").RunState["accounts"][string]} credentials Its credentials
   */
  addAccount(name, credentials) {
    this.state.accounts = { ...this.state.accounts, [name]: credentials };
    saveRun(this.state);
  }

  /**
   * An address unique to this run and journey, which the mail sink receives.
   *
   * @param {string} name The local part
   * @returns {string} The address
   */
  email(name) {
    return `${name}+${this.state.id}-${slug(this.journey)}@verify.local`.toLowerCase();
  }

  /**
   * A string unique to this journey, for names a journey creates.
   *
   * @param {string} prefix What the string starts with
   * @returns {string} The unique string
   */
  unique(prefix) {
    return `${prefix} ${randomBytes(UNIQUE_BYTES).toString("hex")}`;
  }

  /** A password the DMS policy accepts. */
  password() {
    return newPassword();
  }

  /** The credentials `onboard` creates for the run's administrator. */
  adminCredentials() {
    return adminCredentials(this.state);
  }

  /** Creates the administrator through `POST /api/onboarding/register`, then signs it in. */
  onboard(options = {}) {
    return onboard(this.state, options);
  }

  /**
   * Runs `action` against the base version's backend on the same database,
   * then the run's own backend again: data written inside `action` is data
   * the previous release wrote. Records the base commit as a step.
   *
   * @param {(sha: string) => Promise<void>} action What to do against the base backend
   * @returns {Promise<string>} The base commit
   */
  async withBaseBackend(action) {
    const sha = await withBaseBackend(this.state, this.skill, action);
    writeJson(join(this.step("base version"), "base.json"), {
      baseRef: this.state.baseRef,
      sha,
    });
    return sha;
  }

  /** Restarts the backend on the same database, to prove what persists. */
  restartBackend() {
    return restartBackend(this.state);
  }

  /**
   * The mail the sink captured since the journey started, waiting until
   * `accept` matches one or the timeout passes; `match` is the latest match.
   *
   * @param {(message: CapturedMail) => boolean} accept Whether a message is the awaited one
   * @param {number} [timeoutMs] How long to wait
   * @returns {Promise<{ folder: string, messages: CapturedMail[], match: CapturedMail | undefined }>} What arrived
   */
  async mail(accept, timeoutMs = EXPECT_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    const since = (message) => message.receivedAt >= this.startedAt;
    let messages = capturedMail(this.state.mail).filter(since);
    while (!messages.some(accept) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      messages = capturedMail(this.state.mail).filter(since);
    }
    const folder = this.step("mail");
    writeJson(join(folder, "mail.json"), messages);
    return { folder, messages, match: messages.findLast(accept) };
  }

  async close() {
    for (const context of this.contexts.values()) {
      await context.close().catch(() => undefined);
    }
  }
}

/**
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {string} feature The feature the journey belongs to
 * @param {Journey} journey The journey
 * @param {JourneyContext} context The journey's context
 */
async function prepare(state, feature, journey, context) {
  await ensureMail(state);
  if (journey.database !== "shared") {
    const index = String((state.journeyCount ?? 0) + 1).padStart(3, "0");
    state.journeyCount = Number(index);
    await freshDatabase(state, `j${index}`);
    writeJson(join(context.step("fresh database"), "database.json"), {
      database: state.database,
    });
  }
  if (journey.onboard === false || state.accounts?.admin) return;
  const folder = context.step("onboard the administrator");
  const answer = await onboard(state, {});
  context.record(
    folder,
    [
      holds(
        "POST /api/onboarding/register answers 2xx",
        answer.register.status === 200,
        answer.register.status,
      ),
      holds(
        "the administrator signs in",
        answer.login?.status === 200,
        answer.login?.status,
      ),
    ],
    { critical: true },
  );
}

/**
 * Runs one journey: by default on a fresh database with an onboarded
 * administrator (`database: "shared"` keeps the current one, `onboard:
 * false` skips the administrator), with a fresh browser, and writes its
 * result.json.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {string} feature The feature it belongs to
 * @param {Journey} journey The journey
 * @param {import("./verify/skill.mjs").Skill} skill The skill the journey belongs to
 * @returns {Promise<FeatureResult>} The result
 */
export async function runJourney(state, feature, journey, skill) {
  const browser = await launchBrowser(resolutionFolders(state));
  const context = new JourneyContext(
    state,
    feature,
    journey.id,
    browser,
    skill,
  );
  let error = null;
  try {
    await prepare(state, feature, journey, context);
    await journey.run(context);
  } catch (failure) {
    error =
      failure instanceof JourneyAbort
        ? failure.message
        : String(failure?.stack ?? failure);
  } finally {
    await context.close();
    await browser.close();
  }
  const failed =
    error !== null ||
    context.steps.some((step) => step.checks.some((check) => !check.pass));
  const result = {
    feature,
    journey: journey.id,
    title: journey.title,
    entryPoint: journey.entryPoint,
    status: failed ? "FAIL" : "PASS",
    database: state.database,
    steps: context.steps,
    error,
    folder: relative(state.evidence, context.folder),
  };
  writeJson(join(context.folder, "result.json"), result);
  return result;
}

/**
 * @param {unknown} value A value a journeys module exports
 * @returns {value is Journey} True for an object with the fields a journey run reads
 */
function isJourney(value) {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.entryPoint) &&
    (value.database === undefined || isString(value.database)) &&
    (value.onboard === undefined || typeof value.onboard === "boolean") &&
    typeof value.run === "function"
  );
}

/**
 * Loads the journeys a feature's file exports (`export const journeys`).
 *
 * @param {string} file The journeys module
 * @returns {Promise<Journey[]>} The journeys
 */
export async function loadJourneys(file) {
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  /** @type {unknown} */
  const exported = await import(pathToFileURL(file).href);
  const entries = isRecord(exported) ? exported.journeys : undefined;
  if (!Array.isArray(entries))
    throw new Error(`${file} exports no journeys array`);
  const journeys = entries.filter(isJourney);
  if (journeys.length !== entries.length)
    throw new Error(
      `${file} exports a journey without an id, title, entry point or run function`,
    );
  return journeys;
}

/**
 * Runs a feature's journeys, all or those named, and merges their results
 * into `<feature>/feature.json` so a partial run never drops earlier ones.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {{ file: string, feature: string, ids: string[], skill: import("./verify/skill.mjs").Skill }} request Which journeys, and the skill they belong to
 * @returns {Promise<FeatureResult[]>} The results of this run
 */
export async function runJourneyFile(state, request) {
  const journeys = await loadJourneys(request.file);
  const unknown = request.ids.filter(
    (id) => !journeys.some((journey) => journey.id === id),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Unknown journeys of ${request.feature}: ${unknown.join(", ")}`,
    );
  }
  const selected =
    request.ids.length > 0
      ? journeys.filter((journey) => request.ids.includes(journey.id))
      : journeys;
  /** @type {FeatureResult[]} */
  const results = [];
  for (const journey of selected)
    results.push(
      await runJourney(state, request.feature, journey, request.skill),
    );
  const file = join(state.evidence, request.feature, "feature.json");
  const earlier = existsSync(file) ? readRecordList(file) : [];
  const merged = journeys.flatMap((journey) => {
    const fresh = results.filter((result) => result.journey === journey.id);
    return fresh.length > 0
      ? fresh
      : earlier.filter((result) => result.journey === journey.id);
  });
  writeJson(file, merged);
  saveRun(state);
  return results;
}
