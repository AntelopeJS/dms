#!/usr/bin/env node
/**
 * Checks, with fast-check, the binding prune that follows an option patch:
 * properties.cts generates modules whose option value reads consts, enums,
 * classes, merged interfaces, overloaded functions and destructurings, patches
 * the value with `applyPatch` of the builder engine, and compares the result
 * with the graph of reads it generated. The engine runs as it is, on an
 * in-memory TypeScript project.
 *
 * With no argument it runs 300 modules for each rule; `--full` runs 5,000;
 * `--seed <n>` starts elsewhere and `--verbose` prints a recorded finding's
 * counterexample too. The engine reads the built interface packages, which
 * this script builds when `dist` is missing. Exits 0 when every rule matches
 * the record in SKILL.md, 1 when a rule changed, and 2 when the check could not
 * run.
 *
 * @packageDocumentation
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");
const INTERFACE_BUILDS = ["packages/interface-dms/dist", "packages/interface-dms-builder/dist"];

if (INTERFACE_BUILDS.some((build) => !existsSync(path.join(root, build)))) {
  const build = spawnSync("pnpm", ["run", "--silent", "checks:prepare"], { cwd: root, encoding: "utf8" });
  if (build.status !== 0) {
    console.error(`${build.stdout}${build.stderr}`);
    process.exit(2);
  }
}

const run = spawnSync(process.execPath, ["--import", "tsx", path.join(dir, "properties.cts"), ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
process.exit(run.status ?? 2);
