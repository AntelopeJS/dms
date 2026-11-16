import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT } from "@antelopejs/tooling-configs/formal";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dms = path.join(root, "packages/dms");
const OUTPUT_LIMIT = 64 * 1024 * 1024;
const FAILED_TEST = /^\s+\d+\) (?!\[)"?([\w$]+)/gm;

/**
 * Runs one generated-input check of the real MCP tools: the mocha file of
 * `packages/dms/src/test/formal` that holds it, through `ajs module test` on
 * the built module. Prints nothing when it passes. When it fails it prints
 * `BROKEN <name>` for each failed test, `name` being the tool or the hook the
 * test is titled by, then the runner's output, and exits 1. Exits 2 when the
 * build or the runner could not run.
 *
 * With `DMS_PREBUILT` set it skips the build and uses the `dist` already
 * there, as CI does after its own build step.
 *
 * @param {string} file The test file under `dist/test/formal`, such as `x.test.js`
 * @returns {never}
 */
export function runGeneratedCheck(file) {
  const env = {
    ...process.env,
    DMS_PREBUILT: "1",
    DMS_TEST_DIR: "dist/test/formal",
  };
  if (!process.env.DMS_PREBUILT) {
    const built = spawnSync("pnpm", ["run", "build"], {
      cwd: dms,
      encoding: "utf8",
      maxBuffer: OUTPUT_LIMIT,
    });
    if (built.status !== 0) {
      process.stderr.write(`${built.stdout}${built.stderr}`);
      process.exit(EXIT.tool);
    }
  }
  const run = spawnSync(
    "pnpm",
    ["exec", "ajs", "module", "test", ".", "-f", `dist/test/formal/${file}`],
    { cwd: dms, env, encoding: "utf8", maxBuffer: OUTPUT_LIMIT },
  );
  if (run.status === 0) process.exit(0);
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const failed = [...output.matchAll(FAILED_TEST)].map((match) => match[1]);
  if (failed.length === 0) {
    process.stderr.write(output);
    process.exit(EXIT.tool);
  }
  for (const name of new Set(failed)) console.log(`BROKEN ${name}`);
  process.stdout.write(output);
  process.exit(EXIT.changed);
}
