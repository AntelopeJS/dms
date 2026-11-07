import { existsSync, readdirSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { git } from "../git.mjs";
import { loadJourneys } from "../journey.mjs";
import { journeysFile, readFeatures } from "./skill.mjs";

/**
 * @param {string} file A repository path
 * @param {string[]} globs The globs
 * @returns {boolean} Whether a glob matches the path
 */
function matches(file, globs) {
  return globs.some((glob) => matchesGlob(file, glob));
}

/**
 * Whether a repository path is user-facing: matched by the config's
 * `userFacing` globs and by none of its `notUserFacing` globs.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string} file A repository path
 * @returns {boolean} True when a feature must cover it
 */
export function isUserFacing(skill, file) {
  return (
    matches(file, skill.config.userFacing) &&
    !matches(file, skill.config.notUserFacing ?? [])
  );
}

/**
 * Whether a repository path is shared: matched by the config's `shared`
 * globs and by none of its `notShared` globs. A change to it can alter any
 * feature, so the plan runs them all.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string} file A repository path
 * @returns {boolean} True when the file forces the full set
 */
export function isShared(skill, file) {
  return (
    matches(file, skill.config.shared) && !matches(file, skill.config.notShared)
  );
}

/**
 * The features whose `covers:` globs match a file.
 *
 * @param {string} file A repository path
 * @param {{ name: string, covers: string[] }[]} features The features
 * @returns {string[]} Their names
 */
export function featuresOf(file, features) {
  return features
    .filter((feature) => matches(file, feature.covers))
    .map((feature) => feature.name);
}

/**
 * @param {import("./skill.mjs").Skill} skill The skill
 * @returns {string[]} The tracked paths
 */
function trackedFiles(skill) {
  return git(["ls-files"], skill.repo).split("\n").filter(Boolean);
}

/**
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {ReturnType<typeof readFeatures>[number]} feature The feature
 * @param {string[]} tracked The tracked paths
 * @returns {Promise<string[]>} One line per problem
 */
async function featureProblems(skill, feature, tracked) {
  const problems = [];
  const file = journeysFile(skill, feature.name);
  const journeys = existsSync(file) ? await loadJourneys(file) : null;
  if (!journeys)
    problems.push(`${feature.file}: no journeys/${feature.name}.mjs`);
  for (const journey of journeys ?? []) {
    if (!feature.body.includes(`\`${journey.id}\``)) {
      problems.push(
        `${feature.file}: journey \`${journey.id}\` is not described`,
      );
    }
  }
  if (feature.name !== skill.config.smoke && feature.covers.length === 0) {
    problems.push(`${feature.file}: lists no covers globs`);
  }
  for (const glob of feature.covers) {
    if (!tracked.some((path) => matchesGlob(path, glob))) {
      problems.push(`${feature.file}: glob ${glob} matches no tracked file`);
    }
  }
  for (const doc of feature.docs) {
    if (!existsSync(join(skill.repo, doc))) {
      problems.push(`${feature.file}: docs path ${doc} does not exist`);
    }
  }
  return problems;
}

/**
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string[]} tracked The tracked paths
 * @returns {string[]} One line per problem
 */
function sharedProblems(skill, tracked) {
  return skill.config.shared
    .filter(
      (glob) =>
        !tracked.some(
          (path) =>
            matchesGlob(path, glob) && !matches(path, skill.config.notShared),
        ),
    )
    .map(
      (glob) => `verify.config.ts: shared glob ${glob} matches no tracked file`,
    );
}

/**
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string[]} tracked The tracked paths
 * @returns {string[]} One line per problem
 */
function doorProblems(skill, tracked) {
  const problems = [];
  for (const [kind, rule] of Object.entries(skill.config.doors)) {
    if (!rule) continue;
    for (const glob of [...rule.globs, ...rule.funnels]) {
      if (!tracked.some((path) => matchesGlob(path, glob))) {
        problems.push(
          `verify.config.ts: ${kind} door glob ${glob} matches no tracked file`,
        );
      }
    }
  }
  return problems;
}

/**
 * Checks the map against the repository: every user-facing file is
 * covered, every feature has journeys, each described in its file,
 * existing docs pages, and every feature, shared and door glob matches a
 * tracked file.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @returns {Promise<string[]>} One line per problem
 */
export async function checkMap(skill) {
  const features = readFeatures(skill);
  const tracked = trackedFiles(skill);
  const problems = tracked
    .filter(
      (file) =>
        isUserFacing(skill, file) && featuresOf(file, features).length === 0,
    )
    .map((file) => `unmapped: ${file} matches no feature glob`);
  for (const feature of features)
    problems.push(...(await featureProblems(skill, feature, tracked)));
  if (existsSync(skill.journeysDir)) {
    for (const file of readdirSync(skill.journeysDir).filter((name) =>
      name.endsWith(".mjs"),
    )) {
      const name = file.replace(/\.mjs$/, "");
      if (!features.some((feature) => feature.name === name)) {
        problems.push(`journeys/${file} has no features/${name}.md`);
      }
    }
  }
  return [
    ...problems,
    ...sharedProblems(skill, tracked),
    ...doorProblems(skill, tracked),
  ];
}

/**
 * Maps the diff from the merge base of `baseRef` to HEAD onto features:
 * every touched feature plus the smoke feature runs, a user-facing file
 * outside every glob is an unmapped surface. A changed shared file, or
 * `all`, runs the smoke feature and then every feature; `shared` lists the
 * changed files that forced it.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string} baseRef The base, such as `origin/main`
 * @param {boolean} [all] Run every feature whatever the diff, for a release
 * @returns {import("./types.mjs").Plan} The plan
 */
export function planFor(skill, baseRef, all = false) {
  const features = readFeatures(skill);
  const baseSha = git(["merge-base", baseRef, "HEAD"], skill.repo);
  const changed = git(
    ["diff", "--name-only", "--no-renames", `${baseSha}...HEAD`],
    skill.repo,
  )
    .split("\n")
    .filter(Boolean);
  const touched = features
    .map((feature) => ({
      feature: feature.name,
      files: changed.filter((file) => matches(file, feature.covers)),
    }))
    .filter((entry) => entry.files.length > 0);
  const unmapped = changed.filter(
    (file) =>
      isUserFacing(skill, file) && featuresOf(file, features).length === 0,
  );
  const touchedNames = new Set(touched.map((entry) => entry.feature));
  const docs = [
    ...new Set(
      features
        .filter((feature) => touchedNames.has(feature.name))
        .flatMap((feature) => feature.docs),
    ),
  ];
  const shared = changed.filter((file) => isShared(skill, file));
  const smoke = skill.config.smoke;
  const names =
    all || shared.length > 0
      ? features.map((feature) => feature.name)
      : [...touchedNames];
  return {
    baseRef,
    baseSha,
    headSha: git(["rev-parse", "HEAD"], skill.repo),
    changed,
    touched,
    shared,
    unmapped,
    docs,
    run: [smoke, ...names.filter((name) => name !== smoke)],
  };
}
