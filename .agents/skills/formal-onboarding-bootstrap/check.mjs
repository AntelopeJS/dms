#!/usr/bin/env node
/**
 * Model-checks the first-admin bootstrap with TLC through the shared runner:
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
import { checkSpec, EXIT } from "../../formal/tlc.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Rules main breaks on every instance, with the states in TLC's shortest counterexample. */
const RACE_FINDINGS = {
  AtMostOneOwner: 5,
  RefusedRegisterCreatedNoUser: 8,
};

/** Rules main breaks only when auth.oauth.allowAccountCreation is on. */
const OAUTH_FINDINGS = {
  OnboardedHasOwner: 5,
  OwnerlessStaysOpen: 2,
};

/** The findings of each spec under each configuration, in run order. */
const SPECS = {
  OnboardingBootstrapInviteOnly: {
    ci: RACE_FINDINGS,
    full: RACE_FINDINGS,
  },
  OnboardingBootstrap: {
    ci: { ...RACE_FINDINGS, ...OAUTH_FINDINGS },
    full: { ...RACE_FINDINGS, ...OAUTH_FINDINGS },
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
