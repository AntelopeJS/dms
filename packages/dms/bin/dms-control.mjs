#!/usr/bin/env node
import { parseArgs } from "node:util";
import { OPTIONS } from "./control/options.mjs";
import { print, runStackCommand } from "./control/commands-stack.mjs";
import { runVerifyCommand } from "./control/commands-verify.mjs";

const USAGE = `Usage: dms-control <command>

Drive an isolated DMS (run from the repository, or pass --playground):
  up [--prepare] [--playground <dir>] [--renderer <dir>] [--runs <dir>] [--mongo-url <url>] [--env KEY=VALUE]... [--base <ref>] [--skill <dir>] [--no-standby] [--no-build-cache] [--dev-frontend] [--dev-backend]
                       build and start a playground copy on free ports; print the run folder
                       (--prepare first runs the skill's install and build commands;
                       --renderer serves that built @antelopejs/dms-frontend checkout;
                       --no-standby, or DMS_CONTROL_NO_STANDBY=1, starts each fresh database's
                       backend when it is needed instead of one ahead: about 160 MB less while
                       journeys run, about 5 s more per journey; a journey's standby: false
                       does the same for that journey alone;
                       the frontend build of the same inputs comes from $XDG_CACHE_HOME/dms-control/frontend,
                       --no-build-cache runs ajs dms build as it is;
                       --dev-frontend serves the sources with ajs dms dev instead of a build,
                       which shows the module UI a production frontend leaves out;
                       --dev-backend runs every backend with ajs project dev instead of start,
                       which serves the routes only development serves; a journey's backend
                       field overrides it for that journey)
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
  reset <run>                       move the run onto an empty database and a backend that served nothing
  down <run>                        stop the run, drop its databases, keep its evidence
  timings <run>                     the time each phase of the run took, from evidence/timings.jsonl

Verify a change (the .agents/skills/verify-* folder of the checkout, or --skill <dir>):
  map                               check the feature map covers every user-facing file
  plan [--base <ref>] [--all]       map the diff to features; list shared files and unmapped surfaces
                       (a shared file, or --all for a release, runs every feature)
  journey <run> <feature> [ids...]  run a feature's journeys and record evidence
  doors [patch] [--base <ref>]      print the One-way-door line for a patch, or for the diff
  formal <run> [--all]              run the formal checks that cover the diff (or every one)
  verdict <run> --pr <n> [--all]    render evidence/verdict.md from the results and evidence/judgement.json
                       (--all requires every feature, for a release)
`;

/**
 * @param {string[]} argv The command line without the node and script paths
 * @returns {Promise<number>} The exit code
 */
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
