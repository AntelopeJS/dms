import assert from "node:assert/strict";
import { join, relative, sep } from "node:path";
import test from "node:test";
import { featureOf, journeyOf } from "./test-journey.mjs";

/**
 * @param {string[]} titlePath The test's file, describe titles and title
 * @param {{ type: string, description?: string }[]} [annotations] Its annotations
 * @returns {import("./test-journey.mjs").TestIdentity} The test
 */
function testNamed(titlePath, annotations = []) {
  return {
    title: titlePath.at(-1) ?? "",
    titlePath,
    file: join("/repo", "e2e", titlePath[0] ?? ""),
    annotations,
  };
}

await test("a test whose titles climb out of the evidence folder records inside it, one folder per feature and test (catches a folder name that keeps .. or /, whose journey context deletes the folder it names)", () => {
  const evidence = join("/run", "evidence");
  for (const titlePath of [
    ["a.spec.ts", "..", ".."],
    ["a.spec.ts", "../../x", "/"],
    ["a.spec.ts", "."],
    ["..spec.ts", ""],
  ]) {
    const named = testNamed(titlePath);
    const folder = join(evidence, featureOf(named), journeyOf(named, {}).id);
    const inside = relative(evidence, folder).split(sep);
    assert.equal(inside.length, 2, folder);
    assert.ok(
      inside.every((part) => part !== "" && part !== ".."),
      folder,
    );
  }
});

await test("a registered journey keeps its feature, its whole id, its title and its entry point (catches an id cut short, which moves a long journey's evidence, or a title read from the test name)", () => {
  const id = "builder-period-bound-series-and-comparison-card-answer-over-http";
  const named = testNamed(
    ["journeys.spec.ts", "builder", id],
    [
      { type: "title", description: "the builder answers over HTTP" },
      { type: "entry point", description: "POST /mcp" },
    ],
  );
  assert.equal(featureOf(named), "builder");
  assert.deepEqual(journeyOf(named, { database: "shared" }), {
    database: "shared",
    id,
    title: "the builder answers over HTTP",
    entryPoint: "POST /mcp",
  });
});

await test("a spec outside a describe records under its file's name, titled as written (catches a feature named after the file with its extensions)", () => {
  const named = testNamed(["fixtures.spec.ts", "the admin opens Members"]);
  assert.equal(featureOf(named), "fixtures");
  assert.deepEqual(journeyOf(named, {}), {
    id: "the-admin-opens-Members",
    title: "the admin opens Members",
    entryPoint: "",
  });
});
