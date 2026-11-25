import { spawnSync } from "node:child_process";
import { gitChangedFiles, selectPackages } from "./affected-packages.mjs";

const DMS_TESTS = [
  "e2e/backend-mode",
  "e2e/base",
  "e2e/build-cache",
  "e2e/build-key-refusals",
  "e2e/build-key",
  "e2e/build-layout",
  "e2e/consumer-install",
  "e2e/dashboard",
  "e2e/forwarder",
  "e2e/frontend-mode",
  "e2e/frontend-workspace",
  "e2e/journey",
  "e2e/journey-judge",
  "e2e/journeys-config",
  "e2e/json",
  "e2e/mail",
  "e2e/module-root",
  "e2e/mongo-server",
  "e2e/mongo",
  "e2e/pid-reuse",
  "e2e/processes",
  "e2e/renderer",
  "e2e/run-exports",
  "e2e/run-ports",
  "e2e/run-state",
  "e2e/services",
  "e2e/suite",
  "e2e/tab",
  "e2e/test-journey",
  "e2e/timing",
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
      "node --test checks/unreleased-interfaces.test.mjs checks/affected-packages.test.mjs checks/run-tests.test.mjs checks/oxlint-plugin.test.mjs",
  },
  {
    when: (selected) => selected.has("agents"),
    command: "node --test .agents/formal/maps.test.mjs",
  },
  {
    when: (selected) => selected.has("e2e"),
    command: "node --test e2e/rows.test.mjs e2e/weighted-shards.test.mjs",
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
