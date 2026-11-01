#!/usr/bin/env node
/**
 * Model-checks RealtimeTabs.tla with TLC through the shared runner, once per
 * consumer of the record: the page's `useApiData` read (`View = "page"`),
 * then the table view's row (`View = "table"`).
 *
 * With no argument it runs the CI configurations (`RealtimeTabs<View>.ci.cfg`);
 * with `--full` it runs the full ones (`RealtimeTabs<View>.cfg`). Exits 0 when
 * every rule matches the record in SKILL.md, 1 when a rule changed, and 2 when
 * TLC could not run or the arguments were wrong. The runner exits on the
 * first configuration that changed, so a change in the page view skips the
 * table view.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkSpec, EXIT } from "../../formal/tlc.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));

/**
 * The rules main breaks, with the states in TLC's shortest counterexample,
 * for each view and configuration, in run order.
 */
const VIEWS = {
  RealtimeTabsPage: {
    ci: { ShowsLatest: 11, ReconnectCatchesUp: 20 },
    full: { ShowsLatest: 11, ReconnectCatchesUp: 20 },
  },
  RealtimeTabsTable: {
    ci: { ShowsLatest: 11, ReconnectCatchesUp: 20, NeverGoesBack: 17 },
    full: { ShowsLatest: 11, ReconnectCatchesUp: 20, NeverGoesBack: 17 },
  },
};

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--full")) {
  console.error("usage: node check.mjs [--full]");
  process.exit(EXIT.tool);
}
const mode = args.includes("--full") ? "full" : "ci";

for (const [view, findings] of Object.entries(VIEWS)) {
  await checkSpec({
    dir,
    spec: "RealtimeTabs",
    config: mode === "full" ? view : `${view}.ci`,
    findings: findings[mode],
  });
}
