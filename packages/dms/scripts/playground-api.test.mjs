import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import semver from "semver";
import dmsManifest from "../package.json" with { type: "json" };

const config = new URL("../playground/antelope.config.ts", import.meta.url)
  .href;
const printApiRange = `
  const { source } = (await import(${JSON.stringify(config)})).default.modules.api;
  if (source.type !== "package") throw new Error(\`api source is \${source.type}\`);
  process.stdout.write(source.version);
`;

await test("the playground loads only an api the dms suites run against", () => {
  const loaded = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", printApiRange],
    {
      encoding: "utf8",
    },
  );
  assert.equal(loaded.status, 0, loaded.stderr);
  const tested = dmsManifest.devDependencies["@antelopejs/api"];
  assert.ok(
    semver.subset(loaded.stdout, tested),
    `playground api range ${loaded.stdout} admits versions outside the tested ${tested}`,
  );
});
