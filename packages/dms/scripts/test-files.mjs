import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The test files `ajs module test` collects from a folder. */
const TEST_FILE = /\.(test|spec)\.(js|ts)$/;
const SHARD = /^--shard=(\d+)\/(\d+)$/;

/**
 * Every test file under `root` but those in the `excluded` folders, sorted.
 *
 * @param {string} root The folder the runner would scan
 * @param {string[]} excluded Folders under `root` to leave out
 * @returns {string[]} The file paths
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
      else if (TEST_FILE.test(entry.name)) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

/**
 * The files of shard `index` (1-based) of `count`: every `count`-th file, so
 * the shards of a sorted list stay close in size.
 *
 * @param {string[]} files The sorted files
 * @param {number} index The shard, from 1 to `count`
 * @param {number} count How many shards
 * @returns {string[]} The shard's files
 */
export function shardOf(files, index, count) {
  if (!Number.isInteger(count) || count < 1 || index < 1 || index > count) {
    throw new RangeError(`no shard ${index}/${count}`);
  }
  return files.filter((_, position) => position % count === index - 1);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  const shard = args.map((arg) => SHARD.exec(arg)).find(Boolean);
  const [root, ...excluded] = args.filter((arg) => !SHARD.test(arg));
  const files = testFiles(root, excluded);
  const chosen = shard
    ? shardOf(files, Number(shard[1]), Number(shard[2]))
    : files;
  process.stdout.write(chosen.flatMap((file) => ["-f", file]).join(" "));
}
