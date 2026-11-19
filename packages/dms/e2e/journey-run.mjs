import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { launchBrowser } from "./browser.mjs";
import { judge } from "./journey-judge.mjs";
import { JourneyContext } from "./journey.mjs";
import { frontendRefusal, loadJourneys } from "./journey-load.mjs";
import { readRecordList, writeJson } from "./json.mjs";
import { resolutionFolders } from "./launch.mjs";
import { saveRun } from "./run-state.mjs";
import { onboard } from "./session.mjs";
import { ensureMail } from "./stack.mjs";
import { assertForwardedRun, freshDatabase } from "./backend.mjs";
import { recordTiming, stopwatch, timed } from "./timing.mjs";

/**
 * @typedef {import("./verify/types.mjs").FeatureResult} FeatureResult
 * @typedef {import("./journey-load.mjs").Journey} Journey
 * @typedef {Pick<Journey, "id" | "database" | "onboard" | "backend" | "standby">} JourneyPreparation What a journey asks of the run before it starts
 */

/**
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {string} feature The feature the journey belongs to
 * @param {JourneyPreparation} journey What the journey asks of the run
 * @param {JourneyContext} context The journey's context
 */
async function prepare(state, feature, journey, context) {
  const detail = { feature, journey: journey.id };
  await ensureMail(state);
  if (journey.database !== "shared") {
    const index = String((state.journeyCount ?? 0) + 1).padStart(3, "0");
    state.journeyCount = Number(index);
    await timed(
      state,
      "fresh-database",
      () => freshDatabase(state, `j${index}`, journey),
      detail,
    );
    const backend = state.processes.find((entry) => entry.name === "backend");
    writeJson(join(context.step("fresh database"), "database.json"), {
      database: state.database,
      backendMode: backend?.mode ?? "production",
    });
  }
  if (journey.onboard === false || state.accounts?.admin) return;
  const folder = context.step("onboard the administrator");
  const answer = await timed(
    state,
    "onboard",
    () => onboard(state, {}),
    detail,
  );
  context.record(
    folder,
    [
      context.holds(
        "POST /api/onboarding/register answers 2xx",
        answer.register.status === 200,
        answer.register.status,
      ),
      context.holds(
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
 * false` skips the administrator), with fresh browser contexts, and writes
 * its result.json. The contexts open in `browser`, which it leaves open, or
 * else in a browser it launches and closes.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {string} feature The feature it belongs to
 * @param {Journey} journey The journey
 * @param {import("./verify/skill.mjs").Skill | undefined} skill The skill the journey belongs to
 * @param {Pick<import("playwright-core").Browser, "newContext" | "close">} [browser] The browser to open its contexts in, such as Playwright Test's
 * @returns {Promise<FeatureResult>} The result
 */
export function runJourney(state, feature, journey, skill, browser) {
  const detail = { feature, journey: journey.id };
  return timedJourney(state, detail, async () => {
    const opened =
      browser ??
      (await timed(
        state,
        "browser-launch",
        () => launchBrowser(resolutionFolders(state)),
        detail,
      ));
    try {
      const context = await openJourney(state, feature, journey, skill, opened);
      await context.drive(journey.run);
      return await judgeJourney(context, journey);
    } finally {
      if (browser === undefined) await opened.close();
    }
  });
}

/**
 * Opens a journey's context in `browser` and prepares the run as the
 * journey asks: by default a fresh database with a backend of its own and
 * an onboarded administrator (`database: "shared"` keeps the current one,
 * `onboard: false` skips the administrator). A preparation that fails ends
 * the journey before its body.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {string} feature The feature it belongs to
 * @param {JourneyPreparation} journey What it asks of the run
 * @param {import("./verify/skill.mjs").Skill | undefined} skill The skill it belongs to
 * @param {Pick<import("playwright-core").Browser, "newContext">} browser The browser to open its contexts in
 * @returns {Promise<JourneyContext>} Its context, ended when the preparation failed
 */
export async function openJourney(state, feature, journey, skill, browser) {
  const context = new JourneyContext(
    state,
    feature,
    journey.id,
    browser,
    skill,
  );
  await context.attempt(() => prepare(state, feature, journey, context));
  return context;
}

/**
 * Closes a journey's browser contexts, starting the run's mongod again when
 * the journey left it stopped, then judges the steps it recorded and how it
 * ended against its known failures.
 *
 * @param {JourneyContext} context The journey's context
 * @param {Pick<Journey, "id" | "title" | "entryPoint" | "knownFailures">} journey The journey
 * @returns {Promise<Omit<FeatureResult, "ms">>} The result, without its duration
 */
export async function judgeJourney(context, journey) {
  try {
    await context.close();
  } catch (failure) {
    const closing = `closing the journey failed: ${String(failure?.stack ?? failure)}`;
    const { error } = context.end;
    context.end.error = error === null ? closing : `${error}\n${closing}`;
  }
  const judged = judge(context.steps, context.end, journey.knownFailures ?? {});
  return {
    feature: context.feature,
    journey: journey.id,
    title: journey.title,
    entryPoint: journey.entryPoint,
    status: judged.status,
    database: context.state.database,
    steps: judged.steps,
    error: judged.error,
    folder: relative(context.state.evidence, context.folder),
  };
}

/**
 * Times a journey as `journey`, from the start of `drive` to its judged
 * result, and writes the result with its duration to the journey's
 * result.json.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {{ feature: string, journey: string }} detail The feature and the journey id
 * @param {() => Promise<Omit<FeatureResult, "ms">>} drive Opens, drives and judges the journey
 * @returns {Promise<FeatureResult>} The result
 */
export async function timedJourney(state, detail, drive) {
  const stop = stopwatch();
  /** @type {Omit<FeatureResult, "ms"> | undefined} */
  let result;
  let lap = { ms: 0, startedAt: "" };
  try {
    result = await drive();
  } finally {
    lap = stop();
    recordTiming(state, "journey", lap, result?.status === "PASS", detail);
  }
  const timedResult = { ...result, ms: lap.ms };
  writeJson(join(state.evidence, result.folder, "result.json"), timedResult);
  return timedResult;
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
  assertForwardedRun(state);
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
  const refusal = frontendRefusal(selected, state.frontendMode);
  if (refusal) throw new Error(refusal);
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
