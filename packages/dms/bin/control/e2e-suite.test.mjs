import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import test from "node:test";
import {
  declareSuite,
  declaredSuite,
  suiteJourneys,
  upArgs,
} from "./e2e-suite.mjs";
import { frontendRefusal } from "./journey-load.mjs";
import { OPTIONS } from "./options.mjs";
import { loadSkill } from "./verify/skill.mjs";

const CONFIG = `export default ${JSON.stringify({
  playground: "p",
  prepare: [],
  userFacing: ["src/**"],
  smoke: "smoke",
  smokeJourney: "",
  doors: {},
  formal: [],
})};\n`;

/**
 * A git checkout holding two verify skills, as dms-assistant does, with the
 * process inside its `e2e/` folder, where Playwright loads a config.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {string} The checkout root
 */
function twoSkillCheckout(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dms-e2e-suite-")));
  const cwd = process.cwd();
  const recorded = process.env.DMS_E2E_SUITE;
  t.after(() => {
    process.chdir(cwd);
    if (recorded === undefined) delete process.env.DMS_E2E_SUITE;
    else process.env.DMS_E2E_SUITE = recorded;
    rmSync(root, { recursive: true, force: true });
  });
  spawnSync("git", ["init", "-q"], { cwd: root });
  for (const skill of ["verify-dms-assistant", "verify-dms-builder"]) {
    mkdirSync(join(root, ".agents", "skills", skill), { recursive: true });
    writeFileSync(
      join(root, ".agents", "skills", skill, "verify.config.ts"),
      CONFIG,
    );
  }
  mkdirSync(join(root, "e2e"));
  spawnSync("git", ["add", "-A"], { cwd: root });
  spawnSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "skills"],
    { cwd: root },
  );
  process.chdir(join(root, "e2e"));
  return root;
}

/**
 * @param {string} id The journey id
 * @param {Partial<import("./journey-load.mjs").Journey>} [fields] Its other fields
 * @returns {import("./journey-load.mjs").Journey} The journey
 */
function journey(id, fields = {}) {
  return { id, title: id, entryPoint: "/", async run() {}, ...fields };
}

await test("a suite that names one of two skills loads it from e2e/ and starts its run with --skill (catches a global setup or registerJourneys that discovers the skill, which throws on two)", async (t) => {
  const root = twoSkillCheckout(t);
  await assert.rejects(
    loadSkill(undefined, process.cwd()),
    /found 2; pass --skill/,
  );
  declareSuite({ skill: ".agents/skills/verify-dms-assistant" });
  const suite = declaredSuite();
  const skill = await loadSkill(suite.skill, process.cwd());
  assert.equal(skill.name, "verify-dms-assistant");
  const { values } = parseArgs({
    args: upArgs(suite, false),
    options: OPTIONS,
  });
  assert.equal(
    values.skill,
    join(root, ".agents", "skills", "verify-dms-assistant"),
  );
  assert.equal(values.prepare, true);
  assert.equal(values["dev-frontend"], undefined);
});

await test("a frontend: dev suite starts its run with --dev-frontend, and a prepared one skips --prepare (catches a global setup that always serves a build)", (t) => {
  twoSkillCheckout(t);
  declareSuite({ skill: ".agents/skills/verify-dms-builder", frontend: "dev" });
  const { values } = parseArgs({
    args: upArgs(declaredSuite(), true),
    options: OPTIONS,
  });
  assert.equal(values["dev-frontend"], true);
  assert.equal(values.prepare, undefined);
});

await test('a suite option e2eConfig does not take is refused (catches a typo such as frontend: "development" silently serving a build)', (t) => {
  twoSkillCheckout(t);
  for (const options of [
    { frontend: "development" },
    { frontend: "build" },
    { skill: "" },
    { skills: "x" },
  ]) {
    assert.throws(
      () => declareSuite(options),
      /e2eConfig takes/,
      JSON.stringify(options),
    );
  }
});

await test("a build suite leaves out the journeys that need the development dashboard and a dev suite runs only those, each keeping last ones last (catches a suite that runs a dev journey on a built dashboard)", () => {
  const features = [
    {
      name: "a",
      journeys: [
        journey("a-1", { last: true }),
        journey("a-2"),
        journey("a-dev", { frontend: "dev" }),
      ],
    },
    {
      name: "b",
      journeys: [
        journey("b-dev", { frontend: "dev", last: true }),
        journey("b-1"),
      ],
    },
  ];
  const ids = (/** @type {"build" | "dev"} */ frontend) =>
    suiteJourneys(features, frontend).map(
      (entry) => `${entry.feature}/${entry.journey.id}`,
    );
  assert.deepEqual(ids("build"), ["a/a-2", "b/b-1", "a/a-1"]);
  assert.deepEqual(ids("dev"), ["a/a-dev", "b/b-dev"]);
  assert.throws(
    () =>
      suiteJourneys(
        [...features, { name: "c", journeys: [journey("b-1")] }],
        "build",
      ),
    /b-1/,
  );
});

await test("dms-control journey refuses a journey that needs the development dashboard on a run that serves a build (catches a run that fails it on a missing launcher instead of saying why)", () => {
  const journeys = [journey("plain"), journey("launcher", { frontend: "dev" })];
  assert.match(
    frontendRefusal(journeys, "build") ?? "",
    /^launcher need the development dashboard: start the run with up --dev-frontend$/,
  );
  assert.match(frontendRefusal(journeys, undefined) ?? "", /launcher/);
  assert.equal(frontendRefusal(journeys, "dev"), null);
  assert.equal(frontendRefusal([journey("plain")], "build"), null);
});
