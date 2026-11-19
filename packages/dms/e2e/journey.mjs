import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { withBaseBackend } from "./base.mjs";
import { newContext, screenshot } from "./browser.mjs";
import { startDatabase, stopDatabase } from "./database.mjs";
import { capturedMail } from "./mail.mjs";
import { abortMessage } from "./journey-judge.mjs";
import { writeJson } from "./json.mjs";
import { saveRun } from "./run-state.mjs";
import {
  adminCredentials,
  apiRequest,
  newPassword,
  onboard,
  recordedRequest,
} from "./session.mjs";
import { restartBackend } from "./backend.mjs";
import { Tab } from "./tab.mjs";
import { timed } from "./timing.mjs";

/**
 * @typedef {import("./verify/types.mjs").JourneyCheck} Check
 * @typedef {ReturnType<typeof capturedMail>[number]} CapturedMail
 * @typedef {import("./verify/types.mjs").JourneyStep} Step
 * @typedef {{ error: string | null, abortedAt: string | null }} JourneyEnd How a journey ended early: `abortedAt` names the critical step whose failure ended it, `error` what it threw
 */

const EXPECT_TIMEOUT_MS = 15_000;
const POLL_MS = 250;
const DETAIL_LENGTH = 300;
const UNIQUE_BYTES = 3;

class JourneyAbort extends Error {
  /** @param {string} step The critical step that failed */
  constructor(step) {
    super(abortMessage(step));
    this.step = step;
  }
}

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
   * @param {Pick<import("playwright-core").Browser, "newContext">} browser The Playwright browser
   * @param {import("./journeys-config.mjs").SuiteConfig | undefined} config The journeys config the journey belongs to, none for a browserless run
   */
  constructor(state, feature, journey, browser, config) {
    this.state = state;
    this.config = config;
    this.feature = feature;
    this.journey = journey;
    this.browser = browser;
    this.folder = join(state.evidence, feature, journey);
    /** @type {Step[]} */
    this.steps = [];
    /** @type {Map<string, import("playwright-core").BrowserContext>} */
    this.contexts = new Map();
    this.index = 0;
    /** @type {Tab | undefined} */
    this.lastTab = undefined;
    this.databaseStopped = false;
    /** @type {JourneyEnd} */
    this.end = { error: null, abortedAt: null };
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
      throw new JourneyAbort(relative(this.folder, folder));
    }
    return passed;
  }

  /**
   * Records a step of checks, which may be promises (`tab.visible(...)`).
   * With `{ critical: true }` a failure ends the journey. Writes one
   * `screenshot.png` of the tab driven last into the step folder, whatever
   * the checks' outcome; before any tab was driven it writes none.
   *
   * @param {string} label What the step verifies
   * @param {(Check | Promise<Check>)[]} checks The checks, or promises of them
   * @param {{ critical?: boolean }} [options] Whether a failure ends the journey
   * @returns {Promise<boolean>} Whether every check passed
   */
  async verify(label, checks, options = {}) {
    const folder = this.step(label);
    const settled = await Promise.all(
      checks.map((check) => Promise.resolve(check)),
    );
    if (this.lastTab) await screenshot(this.lastTab.page, folder, this.state);
    return this.record(folder, settled, options);
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

  /** The setup token the run's backend accepts for the first registration (`DMS_SETUP_TOKEN`). */
  setupToken() {
    return this.state.secrets.DMS_SETUP_TOKEN;
  }

  /**
   * Creates the administrator through `POST /api/onboarding/register`, then signs it in.
   *
   * @param {{ platformName?: string }} [options] Wizard details
   * @returns {Promise<{ register: import("./session.mjs").ApiAnswer, login: import("./session.mjs").ApiAnswer | null }>} Both answers
   */
  onboard(options = {}) {
    return onboard(this.state, options);
  }

  /**
   * Runs `action` against the base version's backend on the same database,
   * then the run's own backend again: data written inside `action` is data
   * the previous release wrote. Records the base commit as a step. A base
   * that has no playground yet runs on a copy of the run's playground.
   *
   * @param {(sha: string) => Promise<void>} action What to do against the base backend
   * @returns {Promise<string>} The base commit
   */
  async withBaseBackend(action) {
    if (!this.config) {
      throw new Error(
        "ctx.withBaseBackend() needs a journeys config, and a browserless runJourney has none",
      );
    }
    const sha = await withBaseBackend(this.state, this.config, action);
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
   * Stops the run's mongod, so the backend loses its database until
   * {@link JourneyContext.startDatabase}. When the journey ends with it
   * stopped, it starts again before the next journey.
   *
   * @throws When the run uses `--mongo-url`, whose server it does not own
   */
  async stopDatabase() {
    await stopDatabase(this.state);
    this.databaseStopped = true;
  }

  /** Starts the run's mongod again, at the same URL and with the same data. */
  async startDatabase() {
    await startDatabase(this.state);
    this.databaseStopped = false;
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

  /** Whether a critical step or an error ended the journey early. */
  get ended() {
    return this.end.error !== null || this.end.abortedAt !== null;
  }

  /**
   * Runs a part of the journey unless the journey already ended. A critical
   * step that fails in it, or an error it throws, ends the journey, and
   * `judgeJourney` reads how.
   *
   * @param {() => Promise<unknown>} part The part
   * @returns {Promise<void>} Resolves once it ran, whatever its outcome
   */
  async attempt(part) {
    if (this.ended) return;
    try {
      await part();
    } catch (failure) {
      if (failure instanceof JourneyAbort) this.end.abortedAt = failure.step;
      else this.end.error = String(failure?.stack ?? failure);
    }
  }

  /**
   * Drives a journey's body in this context, timed as `journey-run`, as
   * {@link JourneyContext.attempt} runs a part: what ends it early is the
   * judge's to read, so a critical step that fails at a known failure ends
   * it without failing it.
   *
   * @param {(context: JourneyContext) => Promise<void>} run The body
   * @returns {Promise<void>} Resolves once it ran, whatever its outcome
   */
  drive(run) {
    const detail = { feature: this.feature, journey: this.journey };
    return this.attempt(() =>
      timed(this.state, "journey-run", () => run(this), detail),
    );
  }

  async close() {
    for (const context of this.contexts.values()) {
      await context.close().catch(() => undefined);
    }
    if (this.databaseStopped) await this.startDatabase();
  }
}
