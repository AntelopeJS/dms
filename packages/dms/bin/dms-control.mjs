#!/usr/bin/env node
import { parseArgs } from "node:util";
import { OPTIONS } from "./control/options.mjs";
import { print, runStackCommand } from "./control/commands-stack.mjs";
import { runVerifyCommand } from "./control/commands-verify.mjs";

const USAGE = `Usage: dms-control <command>

Drive an isolated DMS (run from the repository, or pass --playground):
  up [--prepare] [--playground <dir>] [--runs <dir>] [--mongo-url <url>] [--env KEY=VALUE]... [--base <ref>] [--skill <dir>]
                       build and start a playground copy on free ports; print the run folder
                       (--prepare first runs the skill's install and build commands)
  doctor <run> [--verbose]          check the run is worth driving; print the failing checks
  onboard <run> [--platform-name <name>]
                       create the run's administrator through POST /api/onboarding/register
  browser <run> <action> [--as <account>] [--tab <name>] [--role <role> --name <name> [--exact] [--nth <n>]
          [--within-role <role> --within-name <name>]] [--value <text>] [--key <key>] [--path <path>]
                       actions: goto, reload, click, fill, select, check, uncheck, hover, press, wait,
                       snapshot (prints the ARIA tree), screenshot (prints the file), login
  api <run> <method> <path> [--as <account>|anon] [--body <json>]
                       an authenticated request; prints the status and the body
  mail <run>                        the messages the run's mail sink captured
  reset <run>                       restart the backend on an empty database of the run
  down <run>                        stop the run, drop its databases, keep its evidence

Verify a change (the .agents/skills/verify-* folder of the checkout, or --skill <dir>):
  map                               check the feature map covers every user-facing file
  plan [--base <ref>]               map the diff to features; list unmapped surfaces
  journey <run> <feature> [ids...]  run a feature's journeys and record evidence
  seeded <feature...>               run each feature unpatched and with its seeded break
  doors [patch] [--base <ref>]      print the One-way-door line for a patch, or for the diff
  formal <run> [--all]              run the formal checks that cover the diff (or every one)
  verdict <run> --pr <n>            render evidence/verdict.md from the results and evidence/judgement.json
  publish <run> --pr <n>            push the evidence, comment the verdict, set the verify status
`;

async function main(argv) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: OPTIONS,
  });
  const [command, ...rest] = positionals;
  const code =
    (await runStackCommand(command, rest, values)) ??
    (await runVerifyCommand(command, rest, values));
  if (code !== undefined) return code;
  print(USAGE);
  return command ? 2 : 0;
}

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(process.exitCode ?? 0);
  throw error;
});

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`dms-control: ${error?.message ?? error}\n`);
  process.exitCode = 1;
}
