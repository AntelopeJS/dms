#!/usr/bin/env node
/**
 * Model-checks the creation, withdrawal, cancel, accept, expiry and resend of
 * invitations of one email with TLC through the shared runner of
 * @antelopejs/tooling-configs: InviteCreation.tla under the code at the sync
 * commit (`Rules = "main"`), first with three callers of
 * createUserInviteToken, then with a resend, a cancel and an acceptance among
 * them.
 *
 * With no argument it runs the CI configuration of each (`<config>.ci.cfg`);
 * with `--full` it runs the full one (`<config>.cfg`). Exits 0 when both match
 * the record in SKILL.md, 1 when a rule changed, and 2 when TLC could not run.
 * The runner exits on the first configuration that changed. The rules before
 * #974 run in history.mjs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "@antelopejs/tooling-configs/formal";

const dir = path.dirname(fileURLToPath(import.meta.url));

/** The findings of each configuration, with the states in TLC's shortest counterexample. */
const CONFIGS = {
  Callers: { ci: { NoCrash: 29 }, full: { NoCrash: 29 } },
  Retirers: { ci: {}, full: {} },
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
    spec: "InviteCreation",
    config: mode === "full" ? config : `${config}.ci`,
    findings: findings[mode],
  });
}
