import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadRun } from "../bin/control/run-state.mjs";

/**
 * Proves `dms-control up --renderer` serves the given checkout: a marker
 * added to the checkout's `index.html` template appears in the dashboard of
 * a run started with `--renderer` and not in one started without.
 *
 * Usage: node control-renderer-e2e.mjs --playground <built dms playground> --renderer <built dms-frontend checkout>
 */

const CONTROL = resolve(import.meta.dirname, "..", "bin", "dms-control.mjs");
const { values } = parseArgs({
  options: {
    playground: { type: "string" },
    renderer: { type: "string" },
  },
});
assert.ok(
  values.playground && values.renderer,
  "pass --playground and --renderer",
);
const { playground, renderer } = values;

const runs = mkdtempSync(join(tmpdir(), "dms-control-renderer-e2e-"));
const template = join(renderer, "templates", "vue", "index.html");
const original = readFileSync(template, "utf8");
const marker = `renderer-${randomBytes(6).toString("hex")}`;
const marked = original.replace(
  "</head>",
  `<meta name="dms-control-marker" content="${marker}" /></head>`,
);
assert.notEqual(marked, original, "the template has no </head> to mark");

/**
 * @param {string[]} args The dms-control arguments
 * @returns {string} Its last output line
 */
function control(args) {
  const run = spawnSync(process.execPath, [CONTROL, ...args], {
    encoding: "utf8",
    env: { ...process.env, DMS_CONTROL_RUNS: runs },
  });
  assert.equal(run.status, 0, `${args.join(" ")}\n${run.stdout}${run.stderr}`);
  return run.stdout.trim().split("\n").at(-1) ?? "";
}

/**
 * @param {string[]} upArgs The `up` arguments
 * @returns {Promise<string>} The dashboard's HTML
 */
async function dashboardOf(upArgs) {
  const dir = control(["up", "--playground", playground, ...upArgs]);
  try {
    const answer = await fetch(`${loadRun(dir).webUrl}/dms-preview`);
    assert.equal(answer.status, 200);
    return await answer.text();
  } finally {
    control(["down", dir]);
  }
}

try {
  writeFileSync(template, marked);
  const served = await dashboardOf(["--renderer", renderer]);
  assert.ok(
    served.includes(marker),
    "the dashboard of --renderer carries the marker",
  );
  const published = await dashboardOf([]);
  assert.ok(
    !published.includes(marker),
    "the dashboard without --renderer does not",
  );
} finally {
  writeFileSync(template, original);
  rmSync(runs, { recursive: true, force: true });
}
