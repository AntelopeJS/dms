#!/usr/bin/env node
/**
 * Model-checks the default tenant's first-boot provisioning across replicas
 * with TLC through the shared runner of @antelopejs/tooling-configs:
 * DefaultTenantProvisioning.tla under the code at the sync commit
 * (`Rules = "main"`), first with processes that are killed, stall or lose an
 * insert, then with provisioning steps that also throw.
 *
 * With no argument it runs the CI configuration of each (`<config>.ci.cfg`);
 * with `--full` it runs the full one (`<config>.cfg`). Exits 0 when both match
 * the record in SKILL.md, 1 when a rule changed, and 2 when TLC could not run.
 * The runner exits on the first configuration that changed, so a change in
 * the healthy run skips the faults run. The pre-fix rules run in history.mjs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "@antelopejs/tooling-configs/formal";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** The findings of each configuration, with the states in TLC's shortest counterexample. */
const CONFIGS = {
  Healthy: { ci: { EventuallyProvisioned: 27 }, full: { EventuallyProvisioned: 27 } },
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
    spec: "DefaultTenantProvisioning",
    config: mode === "full" ? config : `${config}.ci`,
    findings: findings[mode],
  });
}
