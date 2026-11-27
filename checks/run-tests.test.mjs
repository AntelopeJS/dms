import assert from "node:assert/strict";
import { test } from "node:test";
import { PACKAGES } from "./affected-packages.mjs";
import { testCommands } from "./run-tests.mjs";

const PLAYGROUND = "pnpm --dir packages/dms/playground test";
const BUILD_INTERFACE = "pnpm --filter @antelopejs/interface-dms build";

await test("every package runs every step, the backend checks before the playground; a runner that drops a step or reorders the builds fails it", () => {
  const commands = testCommands(PACKAGES.map(({ name }) => name));
  assert.equal(commands[0], "pnpm --dir packages/dms check:backend");
  assert.ok(commands.indexOf(PLAYGROUND) > 0);
  assert.equal(commands.includes(BUILD_INTERFACE), false);
  assert.equal(commands.length, 7);
});

await test("a playground-only selection builds interface-dms before the playground test; a runner that relies on check:backend for it fails it", () => {
  const commands = testCommands(["playground", "e2e", "agents"]);
  assert.deepEqual(commands.slice(0, 2), [BUILD_INTERFACE, PLAYGROUND]);
  assert.equal(
    commands.some((command) => command.includes("check:backend")),
    false,
  );
});

await test("an empty selection still runs the checks folder's own tests; a runner that runs nothing passes a broken selection script", () => {
  assert.deepEqual(testCommands([]), [
    "node --test checks/unreleased-interfaces.test.mjs checks/affected-packages.test.mjs checks/ci-gate.test.mjs checks/run-tests.test.mjs checks/oxlint-plugin.test.mjs",
  ]);
});
