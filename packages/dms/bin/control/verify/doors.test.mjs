import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { doorLine, flaggedDoors, patchFiles } from "./doors.mjs";

/** @type {import("./skill.mjs").Skill} */
const skill = {
  dir: "/repo/.agents/skills/verify-x",
  name: "verify-x",
  repo: "/repo",
  featuresDir: "",
  journeysDir: "",
  config: {
    playground: "playground",
    prepare: [],
    userFacing: [],
    notUserFacing: [],
    smoke: "smoke",
    smokeJourney: "",
    formal: [],
    doors: {
      data: { globs: ["src/crons/**"], funnels: [], why: "deletes rows" },
      outbound: {
        globs: ["src/utils/*-mail.ts"],
        funnels: ["src/emails.ts"],
        why: "sends mail",
      },
      publish: null,
    },
  },
};

await test("flaggedDoors names each kind a file hits, with its files, through globs and funnels", () => {
  assert.deepEqual(
    flaggedDoors(skill, [
      "src/crons/purge.ts",
      "src/emails.ts",
      "src/utils/invite-mail.ts",
      "src/pages/home.ts",
    ]),
    [
      { kind: "data", files: ["src/crons/purge.ts"] },
      {
        kind: "outbound",
        files: ["src/emails.ts", "src/utils/invite-mail.ts"],
      },
    ],
  );
});

await test("flaggedDoors flags nothing for files outside every rule, a null rule included", () => {
  assert.deepEqual(
    flaggedDoors(skill, ["package.json", "src/pages/home.ts"]),
    [],
  );
});

await test("patchFiles reads the new paths of a unified diff, not the old ones", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-doors-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const patch = join(dir, "change.patch");
  writeFileSync(
    patch,
    [
      "diff --git a/src/old.ts b/src/crons/purge.ts",
      "--- a/src/old.ts",
      "+++ b/src/crons/purge.ts",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "",
    ].join("\n"),
  );
  assert.deepEqual(patchFiles(patch), ["src/crons/purge.ts"]);
});

await test("doorLine lists the flagged kinds, and is empty when none is", () => {
  assert.equal(
    doorLine([{ kind: "data" }, { kind: "outbound" }]),
    "One-way-door: data, outbound",
  );
  assert.equal(doorLine([]), "");
});
