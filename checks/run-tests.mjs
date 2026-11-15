import { spawnSync } from "node:child_process";
import { gitChangedFiles, selectPackages } from "./affected-packages.mjs";

const DMS_TESTS = [
  "bin/control/backend-records",
  "bin/control/backend-mode",
  "bin/control/base",
  "bin/control/backend",
  "bin/control/browser-wire",
  "bin/control/build-cache",
  "bin/control/build-key-refusals",
  "bin/control/build-key",
  "bin/control/build-layout",
  "bin/control/consumer-install",
  "bin/control/forwarder",
  "bin/control/frontend-mode",
  "bin/control/frontend-workspace",
  "bin/control/identity",
  "bin/control/journey",
  "bin/control/json",
  "bin/control/mail",
  "bin/control/module-root",
  "bin/control/mongo-server",
  "bin/control/mongo",
  "bin/control/namespaces",
  "bin/control/pid-guard",
  "bin/control/pid-reuse",
  "bin/control/processes",
  "bin/control/renderer",
  "bin/control/run-ports",
  "bin/control/run-state",
  "bin/control/tab",
  "bin/control/timing",
  "bin/control/verify/decode",
  "bin/control/verify/doors",
  "bin/control/verify/formal",
  "bin/control/verify/map",
  "scripts/backend-automation",
  "scripts/dms-dev",
  "scripts/playground-api",
].map((test) => `packages/dms/${test}.test.mjs`);

/**
 * The root test steps in run order. Each runs when its condition holds for the
 * selected packages. `check:backend` builds both interfaces and dms, so a
 * selection with the playground but not dms builds interface-dms itself.
 *
 * @type {{ when: (selected: Set<string>) => boolean, command: string }[]}
 */
const STEPS = [
  {
    when: (selected) => selected.has("dms"),
    command: "pnpm --dir packages/dms check:backend",
  },
  {
    when: (selected) => selected.has("interface-dms"),
    command: "pnpm --dir packages/interface-dms test",
  },
  {
    when: (selected) =>
      selected.has("playground") &&
      !selected.has("dms") &&
      !selected.has("interface-dms"),
    command: "pnpm --filter @antelopejs/interface-dms build",
  },
  {
    when: (selected) => selected.has("playground"),
    command: "pnpm --dir packages/dms/playground test",
  },
  {
    when: () => true,
    command:
      "node --test checks/unreleased-interfaces.test.mjs checks/affected-packages.test.mjs checks/run-tests.test.mjs",
  },
  {
    when: (selected) => selected.has("agents"),
    command: "node --test .agents/formal/maps.test.mjs",
  },
  {
    when: (selected) => selected.has("verify-dms"),
    command: "node --test .agents/skills/verify-dms/rows.test.mjs",
  },
  {
    when: (selected) => selected.has("dms"),
    command: `node --test ${DMS_TESTS.join(" ")}`,
  },
];

/**
 * The commands the root `pnpm test` runs for a set of selected packages, in
 * order.
 *
 * @param {string[]} selected Package names from `selectPackages`.
 * @returns {string[]}
 */
export const testCommands = (selected) => {
  const names = new Set(selected);
  return STEPS.filter(({ when }) => when(names)).map(({ command }) => command);
};

if (import.meta.main) {
  const selected = selectPackages(
    {
      tier: process.env["ANTELOPEJS_CI_TIER"],
      base: process.env["ANTELOPEJS_TEST_BASE"],
    },
    gitChangedFiles,
  );
  for (const command of testCommands(selected)) {
    const run = spawnSync(command, { shell: true, stdio: "inherit" });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
}
