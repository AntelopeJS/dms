import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { decode, isNumber, recordOf } from "../e2e/json.mjs";

/** Where each sharded suite's CI runs record their seconds, and its weights file. */
const SUITES = {
  builder: {
    artifacts: "builder-durations-*",
    weights: new URL("./test-weights.json", import.meta.url),
  },
  e2e: {
    artifacts: "e2e-durations-*",
    weights: new URL("../../../e2e/test-weights.json", import.meta.url),
  },
};
const USAGE = `usage: node scripts/refresh-test-weights.mjs <${Object.keys(SUITES).join("|")}> <run-id>...`;

/**
 * @param {string} folder A folder to search
 * @returns {string[]} Every `.json` file under it
 */
function jsonFiles(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return jsonFiles(path);
    return entry.name.endsWith(".json") ? [path] : [];
  });
}

/**
 * The mean seconds per test or file over every run, to one decimal place,
 * sorted by key.
 *
 * @param {Record<string, number>[]} measurements One `{ key: seconds }` object per shard run
 * @returns {Record<string, number>}
 */
export function meanWeights(measurements) {
  /** @type {Map<string, number[]>} */
  const samples = new Map();
  for (const measurement of measurements) {
    for (const [file, seconds] of Object.entries(measurement)) {
      samples.set(file, [...(samples.get(file) ?? []), seconds]);
    }
  }
  return Object.fromEntries(
    [...samples]
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([file, seconds]) => [
        file,
        Math.round(
          (seconds.reduce((sum, value) => sum + value, 0) / seconds.length) *
            10,
        ) / 10,
      ]),
  );
}

/**
 * Downloads the artifacts matching `pattern` of the runs into `folder`.
 *
 * @param {string[]} runs Workflow run ids
 * @param {string} pattern The artifact name pattern
 * @param {string} folder An empty folder
 */
function download(runs, pattern, folder) {
  for (const run of runs) {
    const result = spawnSync(
      "gh",
      ["run", "download", run, "-p", pattern, "-D", join(folder, run)],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [name, ...runs] = process.argv.slice(2);
  const suite = Object.entries(SUITES).find(([key]) => key === name)?.[1];
  if (suite === undefined || runs.length === 0) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(1);
  }
  const folder = mkdtempSync(join(tmpdir(), "dms-durations-"));
  try {
    download(runs, suite.artifacts, folder);
    const files = jsonFiles(folder);
    if (files.length === 0) {
      process.stderr.write(
        `no ${suite.artifacts} JSON in runs ${runs.join(", ")}\n${USAGE}\n`,
      );
      process.exit(1);
    }
    const weights = meanWeights(
      files.map((file) =>
        decode(
          recordOf(isNumber),
          JSON.parse(readFileSync(file, "utf8")),
          file,
          "seconds per test",
        ),
      ),
    );
    writeFileSync(suite.weights, `${JSON.stringify(weights, null, 2)}\n`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
