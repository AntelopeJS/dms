import {
  arrayOf,
  decode,
  instanceOf,
  isString,
  nullable,
  recordOf,
  objectOf,
} from "../json.mjs";

/**
 * Guard for the JSON the verification harness reads back, the skill's
 * config. It is checked against the typedef it narrows to, and a value that
 * does not match is refused with an error that names where it was read.
 *
 * @typedef {import("../json.mjs").Guard<unknown>} AnyGuard
 */

const strings = arrayOf(isString);

const isRegexOrNull = nullable(instanceOf(RegExp));

const isFormalCheck = objectOf(
  {
    name: isString,
    covers: strings,
    command: strings,
    violation: isRegexOrNull,
  },
  { files: strings },
);

const isDoorRule = objectOf({
  globs: strings,
  funnels: strings,
  why: isString,
});

/** The default export of a skill's `verify.config.ts`. `notUserFacing`, `shared`, `notShared`, `renderer` and `journeys` may be absent. */
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
  {
    notUserFacing: strings,
    shared: strings,
    notShared: strings,
    renderer: isString,
    journeys: isString,
  },
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
  return {
    ...config,
    notUserFacing: config.notUserFacing ?? [],
    shared: config.shared ?? [],
    notShared: config.notShared ?? [],
  };
}
