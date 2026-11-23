#!/usr/bin/env node
/**
 * Checks, with fast-check, that the backend, Vue and live-route path matchers
 * of the mockup spec agree on every string: properties.cts runs each rule over
 * generated strings against the real functions (no model of them).
 *
 * With no argument it runs 5,000 cases of each rule; `--full` runs 100,000;
 * `--seed <n>` starts elsewhere and `--verbose` prints a recorded finding's
 * counterexample too. Exits 0 when every rule matches the record in SKILL.md,
 * 1 when a rule changed, and 2 when the check could not run.
 *
 * @packageDocumentation
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, "../../..");

const run = spawnSync(process.execPath, ["--import", "tsx", path.join(dir, "properties.cts"), ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});
process.exit(run.status ?? 2);
