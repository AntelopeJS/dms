import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { launchBrowser, newContext } from "./browser.mjs";
import { capturedMail } from "./mail.mjs";
import { saveRun } from "./run-state.mjs";
import {
  adminCredentials,
  apiRequest,
  newPassword,
  onboard,
  recordedRequest,
} from "./session.mjs";
import { freshDatabase, resolutionFolders, restartBackend } from "./stack.mjs";
import { Tab } from "./tab.mjs";

const EXPECT_TIMEOUT_MS = 15_000;
const POLL_MS = 250;
const DETAIL_LENGTH = 300;
const UNIQUE_BYTES = 3;

class JourneyAbort extends Error {}

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** An equality check over JSON-serialisable values. */
function equal(name, actual, expected) {
  const [left, right] = [JSON.stringify(actual), JSON.stringify(expected)];
  return {
    name,
    pass: left === right,
    detail: `expected ${right}, got ${left}`,
  };
}

/** A check that an API answer has `expected` as its status. */
function status(answer, expected) {
  const body = JSON.stringify(answer.body) ?? "";
  return {
    name: `HTTP ${expected}`,
    pass: answer.status === expected,
    detail: `status ${answer.status}: ${body.slice(0, DETAIL_LENGTH)}`,
  };
}

/** A check that a condition holds, with what was observed. */
function holds(name, pass, detail) {
  return { name, pass: Boolean(pass), detail: String(detail) };
}

/**
 * What a journey drives the run through: tabs per account, the API as an
 * account, the captured mail, and checks recorded into numbered step
 * folders under `<run>/evidence/<feature>/<journey>/`.
 */
export class JourneyContext {
  constructor(state, feature, journey, browser) {
    this.state = state;
    this.feature = feature;
    this.journey = journey;
    this.browser = browser;
    this.folder = join(state.evidence, feature, journey);
    this.steps = [];
    this.contexts = new Map();
    this.index = 0;
    this.equal = equal;
    this.status = status;
    this.holds = holds;
    rmSync(this.folder, { recursive: true, force: true });
    mkdirSync(this.folder, { recursive: true });
  }

  /** A new numbered step folder. */
  step(label) {
    this.index += 1;
    const name = `${String(this.index).padStart(2, "0")}-${slug(label)}`;
    const folder = join(this.folder, name);
    mkdirSync(folder, { recursive: true });
    return folder;
  }

  /** Records the checks of a step folder; a failed critical step ends the journey. */
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
   */
  async verify(label, checks, options = {}) {
    return this.record(this.step(label), await Promise.all(checks), options);
  }

  /** A new tab as `account` (`anon` for nobody), in that account's own browser context. */
  async tab(account = "admin", label = account) {
    if (!this.contexts.has(account)) {
      this.contexts.set(account, await newContext(this.browser));
    }
    return new Tab(this, await this.contexts.get(account).newPage(), label);
  }

  /** Calls the backend as `as` (an account, or `anon`; `admin` by default) and records the exchange. */
  api(label, request) {
    return apiRequest(this.state, {
      ...request,
      as: request.as ?? "admin",
      folder: () => this.step(`api ${label}`),
    });
  }

  /** Sends anonymous requests at once, for races, each recorded in its own step folder. */
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

  /** Adds an account the journey created (an invited member) so tabs and the API can act as it. */
  addAccount(name, credentials) {
    this.state.accounts = { ...this.state.accounts, [name]: credentials };
    saveRun(this.state);
  }

  /** An address unique to this run and journey, which the mail sink receives. */
  email(name) {
    return `${name}+${this.state.id}-${slug(this.journey)}@verify.local`.toLowerCase();
  }

  /** A string unique to this journey, for names a journey creates. */
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

  /** Restarts the backend on the same database, to prove what persists. */
  restartBackend() {
    return restartBackend(this.state);
  }

  /** The mail the sink captured, waiting until `accept` matches one or the timeout passes. */
  async mail(accept, timeoutMs = EXPECT_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    let messages = capturedMail(this.state.mail);
    while (!messages.some(accept) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      messages = capturedMail(this.state.mail);
    }
    const folder = this.step("mail");
    writeJson(join(folder, "mail.json"), messages);
    return { folder, messages, match: messages.find(accept) };
  }

  async close() {
    for (const context of this.contexts.values()) {
      await context.close().catch(() => undefined);
    }
  }
}

async function prepare(state, feature, journey, context) {
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
 * @param {Record<string, any>} state The run
 * @param {string} feature The feature it belongs to
 * @param {{ id: string, title: string, entryPoint: string, database?: string, onboard?: boolean, run: (context: JourneyContext) => Promise<void> }} journey The journey
 * @returns {Promise<Record<string, any>>} The result
 */
export async function runJourney(state, feature, journey) {
  const browser = await launchBrowser(resolutionFolders(state));
  const context = new JourneyContext(state, feature, journey.id, browser);
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
 * Loads the journeys a feature's file exports (`export const journeys`).
 *
 * @param {string} file The journeys module
 * @returns {Promise<Record<string, any>[]>} The journeys
 */
export async function loadJourneys(file) {
  if (!existsSync(file)) throw new Error(`${file} does not exist`);
  const { journeys } = await import(pathToFileURL(file).href);
  if (!Array.isArray(journeys))
    throw new Error(`${file} exports no journeys array`);
  return journeys;
}

/**
 * Runs a feature's journeys, all or those named, and merges their results
 * into `<feature>/feature.json` so a partial run never drops earlier ones.
 *
 * @param {Record<string, any>} state The run
 * @param {{ file: string, feature: string, ids: string[] }} request Which journeys
 * @returns {Promise<Record<string, any>[]>} The results of this run
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
  const results = [];
  for (const journey of selected)
    results.push(await runJourney(state, request.feature, journey));
  const file = join(state.evidence, request.feature, "feature.json");
  const earlier = existsSync(file)
    ? JSON.parse(readFileSync(file, "utf8"))
    : [];
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
