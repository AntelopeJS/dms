#!/usr/bin/env node
/**
 * Model-checks InviteCreation.tla under the rules before the first of the
 * eight fixes of concurrent invitations (AntelopeJS/dms#974), through the
 * shared runner of @antelopejs/tooling-configs. The fixed bug must still break
 * its rules with the counterexample length recorded in SKILL.md, so the model
 * stays able to catch it. Exits 0 when the configuration matches its record,
 * 1 when it changed, and 2 when TLC could not run. Its findings describe old
 * code, not the code at HEAD.
 *
 * @packageDocumentation
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "@antelopejs/tooling-configs/formal";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** The rules each pre-fix configuration breaks, with the states in TLC's shortest counterexample. */
const CONFIGS = {
  Pre974: { AtMostOnePending: 5, OneKeptToken: 5 },
};

if (process.argv.length > 2) {
  console.error("usage: node history.mjs");
  process.exit(EXIT.tool);
}

for (const [config, findings] of Object.entries(CONFIGS)) {
  await checkSpec({ dir, spec: "InviteCreation", config, findings });
}
