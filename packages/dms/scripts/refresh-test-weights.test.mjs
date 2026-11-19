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

await test("exits nonzero with a usage line and leaves the weights alone when given no suite or no run, so a bare invocation cannot empty a file", () => {
  for (const args of [[], ["builder"], ["unit", "123"]]) {
    const before = statSync(WEIGHTS).mtimeMs;
    const run = spawnSync(process.execPath, [SCRIPT, ...args], {
      encoding: "utf8",
    });
    assert.notEqual(run.status, 0, args.join(" "));
    assert.match(run.stderr, /^usage: /, args.join(" "));
    assert.equal(statSync(WEIGHTS).mtimeMs, before, args.join(" "));
  }
});

await test(
  "exits nonzero when the runs carry no durations file, so a run without artifacts cannot empty the weights",
  {
    skip: process.platform === "win32" && "the fake gh is a POSIX shell script",
  },
  () => {
    const bin = mkdtempSync(join(tmpdir(), "dms-fake-gh-"));
    try {
      const gh = join(bin, "gh");
      writeFileSync(gh, "#!/bin/sh\nexit 0\n");
      chmodSync(gh, 0o755);
      const before = statSync(WEIGHTS).mtimeMs;
      const run = spawnSync(process.execPath, [SCRIPT, "builder", "123"], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env["PATH"]}`,
        },
      });
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /^no builder-durations-\* JSON in runs 123\n/);
      assert.equal(statSync(WEIGHTS).mtimeMs, before);
    } finally {
      rmSync(bin, { recursive: true, force: true });
    }
  },
);
