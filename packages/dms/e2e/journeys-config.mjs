import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkoutOf } from "./git.mjs";
import { arrayOf, decode, isRecord, isString, objectOf } from "./json.mjs";
import { stopwatch } from "./timing.mjs";

/**
 * @typedef {{ playground: string, renderer?: string, prepare: string[][], smoke: string }} JourneysConfig The default export of a repository's `e2e/journeys.config.ts`: the playground folder and the built renderer checkout the run serves, relative to the repository root; the install and build commands that prepare a run; and the feature whose journeys run first. Each `*.mjs` file of `e2e/journeys/` is a feature, named after the file
 * @typedef {{ source: string, repo: string, playground: string, renderer: string | undefined, prepare: string[][], smoke: string, journeysDir: string, features: string[] }} SuiteConfig A loaded journeys config, its paths absolute, read from `source`
 */

/** Where a repository declares its journeys suite, relative to its root. */
export const JOURNEYS_CONFIG = "e2e/journeys.config.ts";

const OUTPUT_LIMIT = 64 * 1024 * 1024;

const strings = arrayOf(isString);

const isJourneysConfig = objectOf(
  { playground: isString, prepare: arrayOf(strings), smoke: isString },
  { renderer: isString },
);

/**
 * @param {string} folder The journeys folder
 * @returns {string[]} Its features: the names of its `*.mjs` files, sorted
 */
function featuresIn(folder) {
  return readdirSync(folder)
    .filter((file) => file.endsWith(".mjs"))
    .map((file) => file.slice(0, -".mjs".length))
    .sort();
}

/**
 * @param {string} file The config file
 * @param {string} repo The repository root
 * @returns {Promise<SuiteConfig>} The suite it declares
 */
async function loadOwnConfig(file, repo) {
  /** @type {unknown} */
  const loaded = await import(pathToFileURL(file).href);
  const config = decode(
    isJourneysConfig,
    isRecord(loaded) ? loaded.default : undefined,
    file,
    "a journeys config",
  );
  const journeysDir = join(dirname(file), "journeys");
  return {
    source: file,
    repo,
    playground: resolve(repo, config.playground),
    renderer:
      config.renderer === undefined
        ? undefined
        : resolve(repo, config.renderer),
    prepare: config.prepare,
    smoke: config.smoke,
    journeysDir,
    features: existsSync(journeysDir) ? featuresIn(journeysDir) : [],
  };
}

/**
 * The journeys suite of the checkout holding `cwd`: the journeys config
 * `config` names, else `e2e/journeys.config.ts`.
 *
 * @param {string} cwd Where the suite runs
 * @param {string} [config] A journeys config file, relative to the repository root, whose journeys are in `journeys/` beside it; `e2e/journeys.config.ts` by default
 * @returns {Promise<SuiteConfig>} The suite
 * @throws When the config does not exist or does not load
 */
export async function loadSuiteConfig(cwd, config) {
  const repo = resolve(checkoutOf(cwd).root ?? cwd);
  const own = resolve(repo, config ?? JOURNEYS_CONFIG);
  if (!existsSync(own)) {
    throw new Error(`the journeys config ${own} does not exist`);
  }
  return loadOwnConfig(own, repo);
}

/**
 * The journeys module of a feature.
 *
 * @param {SuiteConfig} config The suite
 * @param {string} feature The feature name
 * @returns {string} Its path
 */
export function journeysFile(config, feature) {
  return join(config.journeysDir, `${feature}.mjs`);
}

/**
 * Runs the suite's `prepare` commands (install and build) in a checkout of
 * the repository, so a run starts from a fresh build.
 *
 * @param {Pick<SuiteConfig, "prepare">} config The suite
 * @param {string} cwd The checkout
 * @returns {import("./timing.mjs").TimingEntry[]} One timing entry per command, for the run folder that does not exist yet
 * @throws When a command fails, with its output
 */
export function runPrepare(config, cwd) {
  return config.prepare.map(([program, ...args]) => {
    const stop = stopwatch();
    const result = spawnSync(program, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: OUTPUT_LIMIT,
      env: { ...process.env, CI: "1" },
    });
    if (result.status !== 0) {
      throw new Error(
        `${program} ${args.join(" ")} failed in ${cwd}:\n${result.stdout}${result.stderr}`,
      );
    }
    return {
      phase: "prepare",
      ...stop(),
      ok: true,
      command: [program, ...args].join(" "),
    };
  });
}
