import { existsSync, readdirSync } from "node:fs";
import { join, matchesGlob } from "node:path";
import { git } from "../git.mjs";
import { flaggedDoors } from "./doors.mjs";
import { loadJourneys } from "../journey.mjs";
import { journeysFile, readFeatures } from "./skill.mjs";

function matches(file, globs) {
  return globs.some((glob) => matchesGlob(file, glob));
}

/**
 * Whether a repository path is user-facing: matched by the config's
 * `userFacing` globs and by none of its `notUserFacing` globs.
 *
 * @param {Record<string, any>} skill The skill
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

function trackedFiles(skill) {
  return git(["ls-files"], skill.repo).split("\n").filter(Boolean);
}

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
  if (!existsSync(join(skill.seededBreaksDir, `${feature.name}.patch`))) {
    problems.push(
      `${feature.file}: seeded-breaks/${feature.name}.patch is missing`,
    );
  }
  return problems;
}

function doorProblems(skill, tracked) {
  const problems = [];
  for (const [kind, rule] of Object.entries(skill.config.doors)) {
    if (!rule) continue;
    if (!existsSync(join(skill.seededDoorsDir, `${kind}.patch`))) {
      problems.push(
        `seeded-doors/${kind}.patch is missing for the ${kind} door rule`,
      );
    }
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
 * covered, every feature has journeys, each described in its file, a
 * seeded break and existing docs pages, every feature and door glob
 * matches a tracked file, and every door rule has a seeded door.
 *
 * @param {Record<string, any>} skill The skill
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
  return [...problems, ...doorProblems(skill, tracked)];
}

const CONTAINED_KINDS = ["data", "format"];

/**
 * The containment journeys, as `feature/journey`, of the Data and Format
 * doors a set of changed files opens: a door row must name one of them,
 * passing in the run.
 *
 * @param {Record<string, any>} skill The skill
 * @param {string[]} changed Repository paths
 * @returns {string[]} The journeys, each once
 */
function containmentJourneys(skill, changed) {
  const kinds = flaggedDoors(skill, changed)
    .map((door) => door.kind)
    .filter((kind) => CONTAINED_KINDS.includes(kind));
  return [
    ...new Set(
      kinds.flatMap((kind) => skill.config.doors[kind]?.containments ?? []),
    ),
  ];
}

/**
 * Maps the diff from the merge base of `baseRef` to HEAD onto features:
 * every touched feature plus the smoke feature runs, a user-facing file
 * outside every glob is an unmapped surface, and `containments` lists the
 * journeys that can contain each Data or Format door the diff opens.
 *
 * @param {Record<string, any>} skill The skill
 * @param {string} baseRef The base, such as `origin/main`
 * @returns {{ baseRef: string, baseSha: string, headSha: string, changed: string[], touched: { feature: string, files: string[] }[], unmapped: string[], docs: string[], containments: string[], run: string[] }} The plan
 */
export function planFor(skill, baseRef) {
  const features = readFeatures(skill);
  const baseSha = git(["merge-base", baseRef, "HEAD"], skill.repo);
  const changed = git(["diff", "--name-only", `${baseSha}...HEAD`], skill.repo)
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
  const smoke = skill.config.smoke;
  const containments = containmentJourneys(skill, changed);
  return {
    baseRef,
    baseSha,
    headSha: git(["rev-parse", "HEAD"], skill.repo),
    changed,
    touched,
    unmapped,
    docs,
    containments,
    run: [smoke, ...[...touchedNames].filter((name) => name !== smoke)],
  };
}
