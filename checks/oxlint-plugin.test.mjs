import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import config from "../oxlint.config.ts";

const repo = fileURLToPath(new URL("..", import.meta.url));

const RULE = "dms/no-restricted-syntax";
const wildcardOverride = config.overrides?.find(
  (override) => override.rules?.[RULE],
);

/**
 * Lints `files` (path to source) with only the wildcard override of the
 * repo's config, from a directory laid out like the repo.
 * @param {Record<string, string>} files
 * @returns {string[]} `path:line` of each report
 */
function reports(files) {
  const root = mkdtempSync(join(tmpdir(), "wildcard-grant-read-"));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  writeFileSync(
    join(root, ".oxlintrc.json"),
    JSON.stringify({
      jsPlugins: [join(repo, "checks/oxlint-plugin.mjs")],
      categories: { correctness: "off" },
      overrides: [wildcardOverride],
    }),
  );
  const run = spawnSync(
    join(repo, "node_modules/.bin/oxlint"),
    ["-c", ".oxlintrc.json", "-f", "unix", "."],
    { cwd: root, encoding: "utf8" },
  );
  rmSync(root, { recursive: true, force: true });
  return run.stdout
    .split("\n")
    .filter((line) => line.endsWith("[Error/dms(no-restricted-syntax)]"))
    .map((line) => line.split(":").slice(0, 2).join(":"))
    .sort();
}

await test("reports has and includes of the wildcard in any spelling (catches a selector that misses one)", () => {
  assert.deepEqual(
    reports({
      "packages/dms/src/a.ts": [
        "set.has(WILDCARD_PERMISSION);",
        "list.includes(ALL_PERMISSIONS);",
        'set.has("*");',
        "set?.has('*');",
      ].join("\n"),
      "packages/dms/frontend-vue/layers/dms-ui/app/C.vue":
        '<script setup lang="ts">\nset.has("*");\n</script>\n',
    }),
    [
      "packages/dms/frontend-vue/layers/dms-ui/app/C.vue:2",
      "packages/dms/src/a.ts:1",
      "packages/dms/src/a.ts:2",
      "packages/dms/src/a.ts:3",
      "packages/dms/src/a.ts:4",
    ],
  );
});

await test("leaves other ids, other methods, permissions.ts and the browser copy alone (catches a rule that reports a place allowed to read *)", () => {
  assert.deepEqual(
    reports({
      "packages/dms/src/b.ts": [
        "set.has(permissionId);",
        'pattern.includes("**");',
        'set.add("*");',
        "GrantsEveryPermission(set);",
      ].join("\n"),
      "packages/interface-dms/src/permissions.ts": 'set.has("*");',
      "packages/dms/frontend-vue/layers/dms-core/app/composables/auth/usePermissions.ts":
        'set.has("*");',
    }),
    [],
  );
});
