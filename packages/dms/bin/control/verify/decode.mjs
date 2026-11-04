import { existsSync, readFileSync } from "node:fs";
import {
  arrayOf,
  decode,
  either,
  instanceOf,
  isBoolean,
  isNumber,
  isString,
  nullable,
  oneOf,
  recordOf,
  objectOf,
} from "../json.mjs";

/**
 * Guards for the JSON the verification harness reads back: results it wrote,
 * the verifier's judgement, the statuses GitHub answers and the skill's
 * config. Each is checked against the typedef it narrows to, and a value
 * that does not match is refused with an error that names where it was read.
 *
 * @typedef {import("../json.mjs").Guard<unknown>} AnyGuard
 */

const strings = arrayOf(isString);

const rules = objectOf({
  exitCode: nullable(isNumber),
  violated: strings,
  passing: strings,
});

/** @type {import("../json.mjs").Guard<import("./types.mjs").FormalResult>} The result `runFormalCheck` records in `result.json` */
export const isFormalResult = objectOf(
  {
    name: isString,
    exitCode: nullable(isNumber),
    violated: strings,
    passing: strings,
    folder: isString,
  },
  {
    commits: objectOf({ baseSha: isString, headSha: isString }),
    behaviour: objectOf({
      method: isString,
      changed: isBoolean,
      removed: strings,
      added: strings,
    }),
    checkChanged: isBoolean,
    base: nullable(rules),
    fixed: strings,
    missing: strings,
  },
);

/** @type {import("../json.mjs").Guard<import("./types.mjs").FeatureResult[]>} The journey results a run records in `<feature>/feature.json` */
const isFeatureResults = arrayOf(
  objectOf({
    feature: isString,
    journey: isString,
    title: isString,
    entryPoint: isString,
    status: oneOf(["PASS", "FAIL"]),
    database: isString,
    steps: arrayOf(
      objectOf({
        name: isString,
        checks: arrayOf(
          objectOf({ name: isString, pass: isBoolean, detail: isString }),
        ),
      }),
    ),
    error: nullable(isString),
    folder: isString,
  }),
);

/** @type {import("../json.mjs").Guard<import("./types.mjs").RawJudgement>} The verifier's `judgement.json` */
export const isRawJudgement = objectOf(
  {},
  {
    verifier: isString,
    notVerified: strings,
    attention: strings,
    docs: arrayOf(
      objectOf({ page: isString }, { matches: isBoolean, note: isString }),
    ),
    doors: objectOf(
      {},
      {
        none: isString,
        rows: arrayOf(
          objectOf(
            {},
            {
              kind: isString,
              location: isString,
              irreversible: isString,
              containment: isString,
              containmentJourney: isString,
            },
          ),
        ),
        falsePositives: arrayOf(
          objectOf(
            {},
            { kind: isString, location: isString, reason: isString },
          ),
        ),
      },
    ),
  },
);

/** What `gh api repos/<repo>/commits/<sha>/statuses` answers, as far as the harness reads it. */
export const isCommitStatuses = arrayOf(
  objectOf({ context: isString, state: isString }),
);

const isRegexOrNull = nullable(instanceOf(RegExp));

const isFormalCheck = objectOf(
  {
    name: isString,
    covers: strings,
    command: strings,
    violation: isRegexOrNull,
    passing: isRegexOrNull,
  },
  {
    files: strings,
    baseCommand: strings,
    behaviour: either(
      objectOf({ kind: oneOf(["emit"]) }),
      objectOf({ kind: oneOf(["probe"]), command: strings }),
    ),
  },
);

const isDoorRule = objectOf({
  globs: strings,
  funnels: strings,
  containments: strings,
  why: isString,
});

/** The default export of a skill's `verify.config.ts`. `notUserFacing` may be absent. */
export const isSkillConfig = objectOf(
  {
    playground: isString,
    prepare: arrayOf(strings),
    userFacing: strings,
    smoke: isString,
    smokeJourney: isString,
    doors: recordOf(nullable(isDoorRule)),
    formal: arrayOf(isFormalCheck),
  },
  { notUserFacing: strings, renderer: isString },
);

/**
 * @param {unknown} exported The default export of `verify.config.ts`
 * @param {string} source The config file
 * @returns {import("./skill.mjs").SkillConfig} The config
 * @throws When the export is not a skill config
 */
export function decodeSkillConfig(exported, source) {
  const config = decode(
    isSkillConfig,
    exported,
    source,
    "a verification skill config",
  );
  return { ...config, notUserFacing: config.notUserFacing ?? [] };
}

/**
 * @param {unknown} stored What `result.json` holds
 * @param {string} source The file
 * @returns {import("./types.mjs").FormalResult} The result
 * @throws When the value is not a formal check result
 */
export function decodeFormalResult(stored, source) {
  return decode(isFormalResult, stored, source, "a formal check result");
}

/**
 * @param {unknown} stored What `judgement.json` holds
 * @param {string} source The file
 * @returns {import("./types.mjs").RawJudgement} The judgement
 * @throws When the value is not a judgement
 */
export function decodeRawJudgement(stored, source) {
  return decode(isRawJudgement, stored, source, "a verifier's judgement");
}

/**
 * @param {unknown} answer What `gh api` printed, parsed
 * @param {string} source The command
 * @returns {{ context: string, state: string }[]} The statuses
 * @throws When the value is not a list of statuses
 */
export function decodeCommitStatuses(answer, source) {
  return decode(isCommitStatuses, answer, source, "a list of commit statuses");
}

/**
 * The journey results a run recorded for a feature.
 *
 * @param {string} file The feature's `feature.json`
 * @returns {import("./types.mjs").FeatureResult[]} The results, none when the journeys did not run
 * @throws When the file is not a list of journey results
 */
export function readFeatureResults(file) {
  if (!existsSync(file)) return [];
  /** @type {unknown} */
  const stored = JSON.parse(readFileSync(file, "utf8"));
  return decode(isFeatureResults, stored, file, "a list of journey results");
}
