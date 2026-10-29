import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkoutOf } from "../git.mjs";

const CONFIG_FILE = "verify.config.ts";
const OUTPUT_LIMIT = 64 * 1024 * 1024;

function frontmatterLists(text) {
  const lists = new Map();
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  let current;
  for (const line of (match?.[1] ?? "").split("\n")) {
    const key = /^(\w+):\s*$/.exec(line);
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (key) {
      current = [];
      lists.set(key[1], current);
    } else if (item && current) {
      current.push(item[1].replace(/^"|"$/g, ""));
    }
  }
  return lists;
}

function discover(cwd) {
  const { root } = checkoutOf(cwd);
  const skills = join(root ?? cwd, ".agents", "skills");
  const found = existsSync(skills)
    ? readdirSync(skills)
        .filter((name) => name.startsWith("verify-"))
        .map((name) => join(skills, name))
        .filter((dir) => existsSync(join(dir, CONFIG_FILE)))
    : [];
  if (found.length !== 1) {
    throw new Error(
      `Expected one .agents/skills/verify-*/${CONFIG_FILE} under ${root ?? cwd}, found ${found.length}; pass --skill <dir>.`,
    );
  }
  return found[0];
}

/**
 * Loads a verification skill: its `verify.config.ts` (imported with Node's
 * TypeScript type stripping), its feature files and where its journeys,
 * seeded breaks and seeded doors live. Without `--skill`, the one
 * `.agents/skills/verify-*` folder of the checkout holding `cwd`.
 *
 * @param {string | undefined} option The `--skill` folder
 * @param {string} cwd Where the command runs
 * @returns {Promise<Record<string, any>>} The skill
 */
export async function loadSkill(option, cwd) {
  const dir = resolve(option ?? discover(cwd));
  const { root } = checkoutOf(dir);
  if (!root) throw new Error(`${dir} is not inside a git checkout`);
  const { default: config } = await import(
    pathToFileURL(join(dir, CONFIG_FILE)).href
  );
  return {
    dir,
    name: basename(dir),
    repo: root,
    config,
    featuresDir: join(dir, "features"),
    journeysDir: join(dir, "journeys"),
    seededBreaksDir: join(dir, "seeded-breaks"),
    seededDoorsDir: join(dir, "seeded-doors"),
  };
}

/**
 * Every feature file under `features/`, README.md excluded, with its
 * `covers:` globs, `docs:` pages and text.
 *
 * @param {Record<string, any>} skill The skill
 * @returns {{ name: string, file: string, covers: string[], docs: string[], body: string }[]} The features
 */
export function readFeatures(skill) {
  return readdirSync(skill.featuresDir)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .sort()
    .map((file) => {
      const text = readFileSync(join(skill.featuresDir, file), "utf8");
      const lists = frontmatterLists(text);
      return {
        name: file.replace(/\.md$/, ""),
        file: relative(skill.repo, join(skill.featuresDir, file)),
        covers: lists.get("covers") ?? [],
        docs: lists.get("docs") ?? [],
        body: text,
      };
    });
}

/**
 * The journeys module of a feature.
 *
 * @param {Record<string, any>} skill The skill
 * @param {string} feature The feature name
 * @returns {string} Its path
 */
export function journeysFile(skill, feature) {
  return join(skill.journeysDir, `${feature}.mjs`);
}

/**
 * Runs the config's `prepare` commands (install and build) in a checkout of
 * the repository, so a run starts from a fresh build.
 *
 * @param {Record<string, any>} skill The skill
 * @param {string} cwd The checkout
 * @throws When a command fails, with its output
 */
export function runPrepare(skill, cwd) {
  for (const [program, ...args] of skill.config.prepare) {
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
  }
}
