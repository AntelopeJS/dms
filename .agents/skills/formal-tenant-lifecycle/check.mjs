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
 * healthy database skips the faults run.
 */
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

for (const [config, findings] of Object.entries(CONFIGS)) {
  await checkSpec({
    dir,
    spec: "TenantLifecycle",
    config: mode === "full" ? config : `${config}.ci`,
    findings: findings[mode],
  });
}
