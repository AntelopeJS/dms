#!/usr/bin/env node
/**
 * Model-checks DefaultTenantProvisioning.tla under the rules before each fix
 * of the default tenant's provisioning, through the shared runner of
 * @antelopejs/tooling-configs. Each fixed bug must still break its rules with
 * the counterexample length recorded in SKILL.md, so the model stays able to
 * catch it. Exits 0 when every configuration matches its record, 1 when one
 * changed, and 2 when TLC could not run. `dms-control formal` does not run
 * this file: its findings describe old code, not the code at HEAD.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "@antelopejs/tooling-configs/formal";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** The rules each pre-fix configuration breaks, with the states in TLC's shortest counterexample. */
const CONFIGS = {
  Pre613: { PendingUntilComplete: 3, NoDuplicateTenant: 5, EventuallyProvisioned: 7 },
  Pre657: {
    SingleHolder: 6,
    PendingUntilComplete: 12,
    NoDuplicateTenant: 5,
    EventuallyProvisioned: 16,
  },
  Pre133: { PendingUntilComplete: 15, EventuallyProvisioned: 19 },
};

if (process.argv.length > 2) {
  console.error("usage: node history.mjs");
  process.exit(EXIT.tool);
}

for (const [config, findings] of Object.entries(CONFIGS)) {
  await checkSpec({ dir, spec: "DefaultTenantProvisioning", config, findings });
}
