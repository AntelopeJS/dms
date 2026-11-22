import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const CMD_EXPANDED_IN_QUOTES = /["%!\p{Cc}]/u;

/**
 * Runs npm with `args`. On Windows npm is a `.cmd` shim that only cmd.exe
 * runs, so the command goes through cmd.exe with each argument double-quoted,
 * as `runPackageManager` in `packages/dms` does. An argument cmd.exe would
 * expand even inside quotes is refused.
 *
 * @param {string[]} args
 * @param {{ cwd: string }} options
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function npm(args, options) {
  if (process.platform !== "win32") return run("npm", args, options);
  const unsafe = args.find((argument) => CMD_EXPANDED_IN_QUOTES.test(argument));
  if (unsafe !== undefined)
    throw new Error(`cmd.exe cannot pass ${JSON.stringify(unsafe)} unchanged`);
  const quoted = args.map(
    (argument) => `"${argument.replace(/(\\+)$/, "$1$1")}"`,
  );
  return run(["npm", ...quoted].join(" "), { ...options, shell: "cmd.exe" });
}

const packageRoot = join(import.meta.dirname, "..");
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

/** A zod 4 range, as a module on zod 4 declares it. */
const CONSUMER_ZOD_RANGE = "^4.4.0";

const DATA_TYPE_SUBCLASS = `
import { DataType, RegisterDataType } from "@antelopejs/interface-dms/base/data-types";
import { FormComponents } from "@antelopejs/interface-dms/base/form-schema";
import { z } from "zod";

@RegisterDataType("flag")
export class FlagType extends DataType {
  protected defaultInputComponent() {
    return FormComponents.InputCheckbox();
  }

  getValidation() {
    return z.object({ on: z.boolean(), label: z.string().optional() });
  }
}
`;

const TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    module: "commonjs",
    moduleResolution: "bundler",
    strict: true,
    experimentalDecorators: true,
    noEmit: true,
    types: ["node"],
  },
  include: ["*.ts"],
};

/**
 * Installs the packed interface the way a module with no lockfile does, next to its own zod range.
 *
 * @param {string} scratch
 * @returns {Promise<string>} The consumer project directory
 */
async function installConsumer(scratch) {
  const { stdout } = await npm(
    ["pack", "--ignore-scripts", "--silent", "--pack-destination", scratch],
    { cwd: packageRoot },
  );
  const tarball = join(scratch, stdout.trim().split("\n").pop() ?? "");
  const consumer = join(scratch, "consumer");
  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({
      name: "zod-consumer",
      private: true,
      dependencies: {
        "@antelopejs/interface-dms": `file:${tarball}`,
        "@types/node": "^24.0.0",
        zod: CONSUMER_ZOD_RANGE,
      },
    }),
  );
  await writeFile(join(consumer, "tsconfig.json"), JSON.stringify(TSCONFIG));
  await writeFile(join(consumer, "flag-type.ts"), DATA_TYPE_SUBCLASS);
  await npm(["install", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: consumer,
  });
  return consumer;
}

/**
 * Every zod version npm installed, the consumer's and any nested copy.
 *
 * @param {string} consumer
 * @returns {Promise<string[]>}
 */
async function installedZodVersions(consumer) {
  const { stdout } = await npm(["ls", "zod", "--all"], {
    cwd: consumer,
  });
  return [...new Set(stdout.match(/(?<=(?<![\w-])zod@)\d+\.\d+\.\d+/g))];
}

await test(
  "a module on zod 4 shares one zod copy with interface-dms and type-checks its DataType subclass",
  {
    timeout: 300_000,
  },
  async () => {
    const scratch = await mkdtemp(join(tmpdir(), "interface-dms-zod-"));
    try {
      const consumer = await installConsumer(scratch);
      const { stdout, status } = spawnSync(
        process.execPath,
        [tsc, "-p", consumer],
        { encoding: "utf8", timeout: 120_000 },
      );
      assert.equal(stdout, "");
      assert.equal(status, 0);

      const versions = await installedZodVersions(consumer);
      assert.equal(versions.length, 1, `zod copies: ${versions.join(", ")}`);
      assert.match(versions[0], /^4\./);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  },
);
