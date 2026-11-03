import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const scripts = import.meta.dirname;

const OUTPUT = {
  type: "object",
  properties: { done: { title: "$dms.automation.done" } },
};

const node = (extra = {}) => ({
  id: "dms.sample",
  name: "$dms.automation.sample.name",
  description: "$dms.automation.sample.description",
  outputSchema: OUTPUT,
  ...extra,
});

/**
 * @param {import("node:test").TestContext} t
 * @param {{ ACTIONS: object[], TRIGGERS: object[] }} catalogue What the built `dist/automation` exports
 * @returns {{ status: number | null, stdout: string, stderr: string }} A run of `backend-automation.cjs` over it
 */
function load(t, catalogue) {
  const folder = mkdtempSync(join(tmpdir(), "dms-backend-automation-test-"));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  mkdirSync(join(folder, "scripts", "helpers"), { recursive: true });
  mkdirSync(join(folder, "dist", "automation"), { recursive: true });
  for (const file of ["backend-automation.cjs", "helpers/json-record.mjs"])
    cpSync(join(scripts, file), join(folder, "scripts", file));
  writeFileSync(
    join(folder, "dist", "automation", "index.js"),
    `module.exports = ${JSON.stringify(catalogue)};`,
  );
  return spawnSync(
    process.execPath,
    ["-p", "JSON.stringify(require('./scripts/backend-automation.cjs'))"],
    { cwd: folder, encoding: "utf8" },
  );
}

await test("the catalogue is read down to the texts the backend checks compare", (t) => {
  const { status, stdout } = load(t, {
    ACTIONS: [node({ inputSchema: OUTPUT, ignored: 1 })],
    TRIGGERS: [node({ configSchema: { type: "object" } })],
  });
  assert.equal(status, 0);
  assert.deepEqual(JSON.parse(stdout), {
    ACTIONS: [
      {
        id: "dms.sample",
        name: "$dms.automation.sample.name",
        description: "$dms.automation.sample.description",
        outputSchema: {
          properties: { done: { title: "$dms.automation.done" } },
        },
        inputSchema: {
          properties: { done: { title: "$dms.automation.done" } },
        },
      },
    ],
    TRIGGERS: [
      {
        id: "dms.sample",
        name: "$dms.automation.sample.name",
        description: "$dms.automation.sample.description",
        outputSchema: {
          properties: { done: { title: "$dms.automation.done" } },
        },
        configSchema: {},
      },
    ],
  });
});

/**
 * @type {readonly (readonly [string, { ACTIONS: object[], TRIGGERS: object[] }, string])[]}
 */
const MISSING_SCHEMAS = [
  [
    "an action without inputSchema",
    { ACTIONS: [node()], TRIGGERS: [] },
    "inputSchema",
  ],
  [
    "an action without outputSchema",
    {
      ACTIONS: [node({ inputSchema: OUTPUT, outputSchema: undefined })],
      TRIGGERS: [],
    },
    "outputSchema",
  ],
  [
    "a trigger without configSchema",
    { ACTIONS: [], TRIGGERS: [node()] },
    "configSchema",
  ],
  [
    "a trigger without outputSchema",
    {
      ACTIONS: [],
      TRIGGERS: [node({ configSchema: OUTPUT, outputSchema: undefined })],
    },
    "outputSchema",
  ],
  [
    "an action whose inputSchema is a list",
    { ACTIONS: [node({ inputSchema: [] })], TRIGGERS: [] },
    "inputSchema",
  ],
];

for (const [kind, catalogue, key] of MISSING_SCHEMAS) {
  await test(`${kind} makes the load throw`, (t) => {
    const { status, stderr } = load(t, catalogue);
    assert.notEqual(status, 0);
    assert.match(stderr, new RegExp(`TypeError: ${key} is not a JSON object`));
  });
}
