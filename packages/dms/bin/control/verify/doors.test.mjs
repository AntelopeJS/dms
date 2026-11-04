import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { flaggedDoors, patchFiles } from "./doors.mjs";
import { loadSkill } from "./skill.mjs";

const skill = await loadSkill(undefined, import.meta.dirname);
const kinds = Object.entries(skill.config.doors)
  .filter(
    ([kind, rule]) =>
      rule && existsSync(join(skill.seededDoorsDir, `${kind}.patch`)),
  )
  .map(([kind]) => kind);

for (const kind of kinds) {
  const patch = join(skill.seededDoorsDir, `${kind}.patch`);

  await test(`the ${kind} seeded door applies to the current tree`, () => {
    assert.doesNotThrow(
      () =>
        execFileSync("git", ["apply", "--check", patch], {
          cwd: skill.repo,
          stdio: "pipe",
        }),
      `${kind}.patch no longer applies; refresh it against the current source`,
    );
  });

  await test(`the ${kind} seeded door flags the ${kind} door`, () => {
    const flagged = flaggedDoors(skill, patchFiles(patch)).map(
      (door) => door.kind,
    );
    assert.ok(
      flagged.includes(kind),
      `${kind}.patch flags ${flagged.join(", ") || "nothing"}`,
    );
  });
}
