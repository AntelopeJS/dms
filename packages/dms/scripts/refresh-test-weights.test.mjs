import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  statSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { meanWeights } from "./refresh-test-weights.mjs";

const SCRIPT = fileURLToPath(
  new URL("./refresh-test-weights.mjs", import.meta.url),
);
const WEIGHTS = fileURLToPath(new URL("./test-weights.json", import.meta.url));

await test("averages each file over the runs to one decimal and sorts by path, so a refresh is stable and reviewable", () => {
  assert.deepEqual(
    meanWeights([
      { "b.test.js": 10, "a.test.js": 1 },
      { "b.test.js": 11.04, "c.test.js": 2.26 },
    ]),
    { "a.test.js": 1, "b.test.js": 10.5, "c.test.js": 2.3 },
  );
  assert.deepEqual(Object.keys(meanWeights([{ z: 1, a: 1 }])), ["a", "z"]);
});

await test("exits nonzero with a usage line and leaves the weights alone when given no run, so a bare invocation cannot empty the file", () => {
  const before = statSync(WEIGHTS).mtimeMs;
  const run = spawnSync(process.execPath, [SCRIPT], { encoding: "utf8" });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /^usage: /);
  assert.equal(statSync(WEIGHTS).mtimeMs, before);
});

await test("exits nonzero when the runs carry no durations file, so a run without artifacts cannot empty the weights", () => {
  const bin = mkdtempSync(join(tmpdir(), "dms-fake-gh-"));
  try {
    const gh = join(bin, "gh");
    writeFileSync(gh, "#!/bin/sh\nexit 0\n");
    chmodSync(gh, 0o755);
    const before = statSync(WEIGHTS).mtimeMs;
    const run = spawnSync(process.execPath, [SCRIPT, "123"], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}${delimiter}${process.env["PATH"]}` },
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /usage: /);
    assert.equal(statSync(WEIGHTS).mtimeMs, before);
  } finally {
    rmSync(bin, { recursive: true, force: true });
  }
});
