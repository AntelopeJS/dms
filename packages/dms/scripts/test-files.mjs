import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { decode, isNumber, recordOf } from "../bin/control/json.mjs";

/** The test files `ajs module test` collects from a folder. */
const TEST_FILE = /\.(test|spec)\.(js|ts)$/;
const SHARD = /^--shard=(\d+)\/(\d+)$/;
const WEIGHTS = /^--weights=(.+)$/;

/**
 * Every test file under `root` but those in the `excluded` folders, sorted.
 *
 * @param {string} root The folder the runner would scan
 * @param {string[]} excluded Folders under `root` to leave out
 * @returns {string[]} The file paths, with `/` separators on every OS
 */
export function testFiles(root, excluded) {
  const skipped = new Set(excluded.map((folder) => join(folder)));
  /** @type {string[]} */
  const files = [];
  /** @param {string} folder The folder to scan */
  const visit = (folder) => {
    if (skipped.has(join(folder))) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (TEST_FILE.test(entry.name))
        files.push(path.split(sep).join("/"));
    }
  };
  visit(root);
  return files.sort();
}

/**
 * The files of shard `index` (1-based) of `count`, balanced by weight with
 * the longest-processing-time rule: the files go by descending weight, then
 * path, each to the least-loaded shard, the lowest index on a tie. A file with
 * no weight counts as the median of the known weights, or 1 when none is known.
 *
 * @param {string[]} files The files
 * @param {number} index The shard, from 1 to `count`
 * @param {number} count How many shards
 * @param {Record<string, number>} [weights] Seconds per file
 * @returns {string[]} The shard's files, sorted
 */
export function shardOf(files, index, count, weights = {}) {
  if (!Number.isInteger(count) || count < 1 || index < 1 || index > count) {
    throw new RangeError(`no shard ${index}/${count}`);
  }
  const known = files
    .map((file) => weights[file])
    .filter((weight) => weight !== undefined)
    .sort((left, right) => left - right);
  const middle = Math.floor(known.length / 2);
  const fallback =
    known.length === 0
      ? 1
      : known.length % 2 === 1
        ? known[middle]
        : (known[middle - 1] + known[middle]) / 2;
  const weighted = files
    .map((file) => ({ file, weight: weights[file] ?? fallback }))
    .sort(
      (left, right) =>
        right.weight - left.weight || (left.file < right.file ? -1 : 1),
    );
  const loads = Array.from({ length: count }, () => 0);
  /** @type {string[]} */
  const chosen = [];
  for (const { file, weight } of weighted) {
    const target = loads.indexOf(Math.min(...loads));
    loads[target] += weight;
    if (target === index - 1) chosen.push(file);
  }
  return chosen.sort();
}

/**
 * @param {string} path A JSON file of seconds per test file
 * @returns {Record<string, number>}
 */
function readWeights(path) {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return decode(recordOf(isNumber), parsed, path, "seconds per test file");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  const shard = args.map((arg) => SHARD.exec(arg)).find(Boolean);
  const weightsFile = args.map((arg) => WEIGHTS.exec(arg)).find(Boolean)?.[1];
  const [root, ...excluded] = args.filter(
    (arg) => !SHARD.test(arg) && !WEIGHTS.test(arg),
  );
  const files = testFiles(root, excluded);
  const chosen = shard
    ? shardOf(
        files,
        Number(shard[1]),
        Number(shard[2]),
        weightsFile === undefined ? undefined : readWeights(weightsFile),
      )
    : files;
  process.stdout.write(chosen.flatMap((file) => ["-f", file]).join(" "));
}
