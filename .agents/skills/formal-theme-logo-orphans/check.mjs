#!/usr/bin/env node
/**
 * Runs the property check of the theme logo orphan cleanup: builds
 * `packages/dms`, then runs `theme-logo-orphans.formal.test.ts` through the
 * module test runner. The file asserts that a theme save through the real
 * `SetTheme` deletes no file a generated app config can name, and that each
 * recorded finding still reproduces. Prints nothing when the file passes.
 * Exits 0 when it passes, 1 and `BROKEN SetThemeKeepsReachableLogos` when a
 * property or a finding changed, and 2 when the build or the runner could not
 * run.
 *
 * @packageDocumentation
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dms = path.join(dir, "../../../packages/dms");
const TEST_FILE = "dist/test/unit/builder/theme-logo-orphans.formal.test.js";
const EXIT = { ok: 0, changed: 1, tool: 2 };

if (process.argv.length > 2) {
  console.error("usage: node check.mjs");
  process.exit(EXIT.tool);
}

/**
 * Runs a command in `packages/dms` and returns its status and output.
 *
 * @param {string} command
 * @returns {{ status: number | null, output: string }}
 */
function run(command) {
  const result = spawnSync(command, {
    cwd: dms,
    shell: true,
    encoding: "utf8",
    maxBuffer: 268435456,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

const build = run("node scripts/unless-prebuilt.mjs pnpm run build");
if (build.status !== 0) {
  console.error(build.output);
  process.exit(EXIT.tool);
}

const test = run(`pnpm exec ajs module test . -f ${TEST_FILE}`);
if (test.status !== 0) {
  console.error(test.output);
  console.error("BROKEN SetThemeKeepsReachableLogos");
  process.exit(EXIT.changed);
}
