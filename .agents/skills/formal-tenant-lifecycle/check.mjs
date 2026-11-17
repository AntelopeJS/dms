#!/usr/bin/env node
/**
 * Model-checks the tenant lifecycle row of @antelopejs/interface-dms with TLC
 * through the shared runner of @antelopejs/tooling-configs: TenantLifecycle.tla
 * on a healthy database, then with database calls that throw or answer
 * "unknown".
 *
 * With no argument it runs the CI configuration of each (`<config>.ci.cfg`);
 * with `--full` it runs the full one (`<config>.cfg`). Exits 0 when both match
 * the record in SKILL.md, 1 when a rule changed, and 2 when TLC could not run.
 * The runner exits on the first configuration that changed, so a change on a
 * healthy database skips the faults run. Before TLC runs, it exits 1 with
 * `BROKEN ReleaseAttempts` when the model's `ReleaseAttempts` is not the
 * `RELEASE_ATTEMPTS` of tenant-lifecycle.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "@antelopejs/tooling-configs/formal";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** The findings of each configuration, with the states in TLC's shortest counterexample. */
const CONFIGS = {
  Healthy: { ci: {}, full: {} },
  Faults: { ci: {}, full: {} },
};

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--full")) {
  console.error("usage: node check.mjs [--full]");
  process.exit(EXIT.tool);
}
const mode = args.includes("--full") ? "full" : "ci";

/**
 * The number `pattern` captures in `file`, or undefined when it matches nothing.
 *
 * @param {string} file
 * @param {RegExp} pattern
 * @returns {number | undefined}
 */
function readCount(file, pattern) {
  const match = pattern.exec(readFileSync(file, "utf8"));
  return match ? Number(match[1]) : undefined;
}

const codeAttempts = readCount(
  path.join(dir, "../../../packages/interface-dms/src/tenant-lifecycle.ts"),
  /^const RELEASE_ATTEMPTS = (\d+);$/m,
);
const modelAttempts = readCount(
  path.join(dir, "TenantLifecycle.tla"),
  /^ReleaseAttempts == (\d+)$/m,
);
if (codeAttempts === undefined || codeAttempts !== modelAttempts) {
  console.error(
    `BROKEN ReleaseAttempts: tenant-lifecycle.ts tries the release ${codeAttempts ?? "an unknown number of"} times, TenantLifecycle.tla assumes ${modelAttempts ?? "no number"}`,
  );
  process.exit(EXIT.changed);
}

for (const [config, findings] of Object.entries(CONFIGS)) {
  await checkSpec({
    dir,
    spec: "TenantLifecycle",
    config: mode === "full" ? config : `${config}.ci`,
    findings: findings[mode],
  });
}
