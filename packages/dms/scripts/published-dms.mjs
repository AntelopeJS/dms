import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import { z } from "zod";

const dmsRoot = fileURLToPath(new URL("..", import.meta.url));
const interfaceRoot = path.join(dmsRoot, "..", "interface-dms");
const fixture = fileURLToPath(new URL("published-dms", import.meta.url));
const ajs = path.join(dmsRoot, "node_modules", ".bin", "ajs");

const PackOutput = z.array(z.object({ filename: z.string() })).length(1);
const ModuleManifest = z
  .object({ dependencies: z.record(z.string(), z.string()) })
  .passthrough();

/**
 * Runs a command with its output captured, and prints that output only when
 * the command fails.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {Promise<string>}
 */
async function run(command, args, options = {}) {
  try {
    const { stdout } = await promisify(execFile)(command, args, {
      ...options,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const failed = z
      .object({ stdout: z.string(), stderr: z.string() })
      .safeParse(error);
    if (failed.success) {
      process.stderr.write(failed.data.stdout + failed.data.stderr);
    }
    throw error;
  }
}

/**
 * Installs `@antelopejs/dms@<version>` from npm into `directory`, with the
 * interface-dms `tarball` in place of the one its range resolves.
 *
 * @param {string} version
 * @param {string} tarball
 * @param {string} directory
 * @returns {Promise<string>} the module's directory
 */
async function installPublishedDms(version, tarball, directory) {
  const [{ filename }] = PackOutput.parse(
    JSON.parse(
      await run("npm", [
        "pack",
        `@antelopejs/dms@${version}`,
        "--json",
        "--pack-destination",
        directory,
      ]),
    ),
  );
  await run("tar", ["xzf", path.join(directory, filename), "-C", directory]);
  const moduleDir = path.join(directory, "package");
  const manifestPath = path.join(moduleDir, "package.json");
  const manifest = ModuleManifest.parse(
    JSON.parse(fs.readFileSync(manifestPath, "utf8")),
  );
  const local = `file:${tarball}`;
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({
      ...manifest,
      dependencies: {
        ...manifest.dependencies,
        "@antelopejs/interface-dms": local,
      },
      overrides: { "@antelopejs/interface-dms": local },
      devDependencies: {},
      scripts: {},
    }),
  );
  await run(
    "npm",
    ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: moduleDir },
  );
  return moduleDir;
}

const versions = process.argv.slice(2);
if (versions.length === 0) {
  throw new Error("usage: node scripts/published-dms.mjs <dms version>...");
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "published-dms-"));
await run("pnpm", ["pack", "--pack-destination", work], { cwd: interfaceRoot });
const packed = fs.readdirSync(work).filter((name) => name.endsWith(".tgz"));
if (packed.length !== 1) {
  throw new Error(
    `expected one interface-dms tarball, found ${packed.join(", ")}`,
  );
}
const tarball = path.join(work, packed[0]);

const mongod = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
  binary: { version: "8.0.8" },
});
try {
  for (const version of versions) {
    const directory = path.join(work, `dms-${version}`);
    fs.mkdirSync(directory);
    const moduleDir = await installPublishedDms(version, tarball, directory);
    const project = path.join(directory, "project");
    fs.cpSync(fixture, project, { recursive: true });
    await run(ajs, ["module", "test", "."], {
      cwd: project,
      env: {
        ...process.env,
        PUBLISHED_DMS_PATH: moduleDir,
        PUBLISHED_DMS_MONGO_URL: mongod.getUri(),
      },
    });
  }
} finally {
  await mongod.stop();
}
