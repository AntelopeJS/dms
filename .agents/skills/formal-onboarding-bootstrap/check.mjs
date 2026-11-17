#!/usr/bin/env node
/**
 * Model-checks the first-admin bootstrap with TLC through the shared runner
 * of @antelopejs/tooling-configs:
 * OnboardingBootstrapInviteOnly.tla, the default instance where OAuth sign-up
 * cannot create accounts, then OnboardingBootstrap.tla, where it can.
 *
 * With no argument it runs the CI configuration of each spec
 * (`<spec>.ci.cfg`); with `--full` it runs the full one (`<spec>.cfg`). Exits
 * 0 when both match the record in SKILL.md, 1 when a rule changed, and 2 when
 * TLC could not run. The runner exits on the first spec that changed, so a
 * change in the invite-only spec skips the OAuth one.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "@antelopejs/tooling-configs/formal";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** The findings of each spec under each configuration, in run order: none breaks on main. */
const SPECS = {
  OnboardingBootstrapInviteOnly: {
    ci: {},
    full: {},
  },
  OnboardingBootstrap: {
    ci: {},
    full: {},
  },
};

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--full")) {
  console.error("usage: node check.mjs [--full]");
  process.exit(EXIT.tool);
}
const mode = args.includes("--full") ? "full" : "ci";

for (const [spec, findings] of Object.entries(SPECS)) {
  await checkSpec({ dir, spec, config: mode === "full" ? spec : `${spec}.ci`, findings: findings[mode] });
}
