import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  API_PACKAGE_NAME,
  API_PACKAGE_VERSION,
  OPTIONAL_AUTOMATION_INTERFACE,
  createConsumer,
  interfaceManifest,
  interfacePackageRoot,
  manifest,
  packageRoot,
  readJson,
  writeTypeScriptConfigs,
} from "./check-package-consumer.mjs";

const selfPath = fileURLToPath(import.meta.url);

/**
 * pnpm exports `NODE_PATH` (the `extend-node-path` setting) pointing at the
 * hoisted store of the workspace that runs the script, and Node appends it to
 * every `require()` lookup, whatever the directory the lookup starts from. The
 * scratch consumer would then resolve packages it never installed -- the
 * optional automation interface among them, once it is on the registry and the
 * workspace install has it on disk. Node freezes the global paths at bootstrap,
 * so the variable has to be gone before this process starts: re-exec once with
 * a clean environment.
 */
if (process.env.NODE_PATH) {
  const { NODE_PATH: _hoistedStore, ...cleanEnv } = process.env;
  const rerun = spawnSync(process.execPath, [selfPath], {
    stdio: "inherit",
    env: cleanEnv,
  });
  if (rerun.error) throw rerun.error;
  process.exit(rerun.status ?? 1);
}

const execFileAsync = promisify(execFile);

const CONCURRENCY = 8;
const API_INTERFACE_PACKAGE_NAME = "@antelopejs/interface-api";
const AUTOMATION_REGISTRATION_FUNCTIONS = [
  "RegisterTriggerType",
  "RegisterActionType",
];
const CODE_EXTENSIONS = new Set([".cjs", ".js", ".mjs"]);
const PACKAGE_ARCHIVE_NAME = "package.tgz";
const INTERFACE_ARCHIVE_NAME = "interface-dms.tgz";

function runPnpm(args, cwd) {
  return execFileAsync("pnpm", args, {
    cwd,
    env: { ...process.env, npm_config_ignore_scripts: "true" },
  });
}

function resolveRuntimeTarget(value) {
  if (typeof value === "string" || value === null) {
    return value;
  }
  return Object.entries(value)
    .filter(([condition]) => condition !== "types")
    .map(([, target]) => resolveRuntimeTarget(target))
    .find((target) => typeof target === "string");
}

function matchesPattern(subpath, pattern) {
  if (!pattern.includes("*")) {
    return subpath === pattern;
  }
  const [prefix, suffix = ""] = pattern.split("*");
  return subpath.startsWith(prefix) && subpath.endsWith(suffix);
}

function collectBlockedPatterns(exportsMap) {
  return Object.entries(exportsMap)
    .filter(([, value]) => value === null)
    .map(([subpath]) => subpath);
}

function expandWildcardSubpath(packageDir, subpath, target) {
  const [targetPrefix, targetSuffix] = target.split("*");
  const baseDir = path.resolve(packageDir, targetPrefix);
  return fs
    .readdirSync(baseDir, { recursive: true })
    .map((entry) => entry.split(path.sep).join("/"))
    .filter((entry) => entry.endsWith(targetSuffix))
    .map((entry) => subpath.replace("*", entry.slice(0, -targetSuffix.length)));
}

function expandExport(packageDir, subpath, value) {
  const target = resolveRuntimeTarget(value);
  if (!target || !CODE_EXTENSIONS.has(path.extname(target))) {
    return [];
  }
  return subpath.includes("*")
    ? expandWildcardSubpath(packageDir, subpath, target)
    : [subpath];
}

/**
 * @param {string} packageDir
 * @param {{ name: string, exports: Record<string, unknown> }} packageManifest
 * @returns {string[]}
 */
function collectPublicSpecifiers(packageDir, packageManifest) {
  const blockedPatterns = collectBlockedPatterns(packageManifest.exports);
  /** @type {string[]} */
  const subpaths = Object.entries(packageManifest.exports).flatMap(
    ([subpath, value]) => expandExport(packageDir, subpath, value),
  );
  return [...new Set(subpaths)]
    .filter(
      (subpath) =>
        !blockedPatterns.some((pattern) => matchesPattern(subpath, pattern)),
    )
    .map((subpath) =>
      subpath === "."
        ? packageManifest.name
        : `${packageManifest.name}${subpath.slice(1)}`,
    )
    .sort();
}

function checkOptionalInterfaceIsAbsent(consumerRoot) {
  const scopedRequire = createRequire(path.join(consumerRoot, "package.json"));
  try {
    scopedRequire.resolve(OPTIONAL_AUTOMATION_INTERFACE);
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      console.log(
        `${OPTIONAL_AUTOMATION_INTERFACE} is absent from the consumer as intended.`,
      );
      return;
    }
    throw error;
  }
  throw new Error(
    `${OPTIONAL_AUTOMATION_INTERFACE} resolved in a consumer that removed it.`,
  );
}

function checkOptionalInterfaceIsPresent(consumerRoot) {
  const packageDir = resolvePackageRoot(
    OPTIONAL_AUTOMATION_INTERFACE,
    consumerRoot,
  );
  const { version } = readJson(path.join(packageDir, "package.json"));
  console.log(
    `${OPTIONAL_AUTOMATION_INTERFACE}@${version} is installed in the consumer that keeps it.`,
  );
}

function resolvePackageRoot(packageName, fromDir) {
  const scopedRequire = createRequire(path.join(fromDir, "package.json"));
  let currentDir = path.dirname(scopedRequire.resolve(packageName));
  while (currentDir !== path.dirname(currentDir)) {
    const manifestPath = path.join(currentDir, "package.json");
    if (fs.existsSync(manifestPath)) {
      const packageManifest = readJson(manifestPath);
      if (packageManifest.name === packageName) return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error(`Could not resolve package root for ${packageName}.`);
}

function checkCanonicalApiInterface(consumerRoot, dmsPackageDir) {
  const apiPackageDir = resolvePackageRoot(API_PACKAGE_NAME, consumerRoot);
  const dmsInterfaceDir = resolvePackageRoot(
    API_INTERFACE_PACKAGE_NAME,
    dmsPackageDir,
  );
  const apiInterfaceDir = resolvePackageRoot(
    API_INTERFACE_PACKAGE_NAME,
    apiPackageDir,
  );
  if (fs.realpathSync(dmsInterfaceDir) !== fs.realpathSync(apiInterfaceDir)) {
    throw new Error(
      `${API_INTERFACE_PACKAGE_NAME} did not resolve canonically.`,
    );
  }
  const interfaceManifest = readJson(
    path.join(apiInterfaceDir, "package.json"),
  );
  console.log(
    `${manifest.name} and ${API_PACKAGE_NAME}@${API_PACKAGE_VERSION} share ${API_INTERFACE_PACKAGE_NAME}@${interfaceManifest.version}.`,
  );
}

async function checkEntrypoint(consumerRoot, specifier) {
  try {
    await execFileAsync(
      process.execPath,
      ["-e", `require(${JSON.stringify(specifier)})`],
      { cwd: consumerRoot },
    );
    return null;
  } catch (error) {
    return { specifier, stderr: error.stderr ?? String(error) };
  }
}

async function runPool(items, worker) {
  const results = [];
  let nextIndex = 0;
  const drain = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  };
  const poolSize = Math.min(CONCURRENCY, items.length);
  await Promise.all(Array.from({ length: poolSize }, drain));
  return results;
}

function reportRuntimeFailures(failures, total) {
  for (const failure of failures) {
    console.error(`✗ require("${failure.specifier}") as first entry failed:`);
    console.error(String(failure.stderr).trim());
    console.error("");
  }
  if (failures.length > 0) {
    throw new Error(
      `${failures.length}/${total} package entrypoints are broken.`,
    );
  }
}

/**
 * The interfaces moved to their own package, so the runtime must no longer
 * answer on `interfaces/*`, and the contract that was dropped before the split
 * must not come back under the interface package either.
 */
const REMOVED_SPECIFIERS = [
  `${manifest.name}/interfaces/dms`,
  `${manifest.name}/interfaces/dms/page`,
  `${manifest.name}/interfaces/dms-base`,
  `${interfaceManifest.name}/job-locks`,
  `${interfaceManifest.name}/job-locks/index`,
  `${interfaceManifest.name}/job-locks/db/models/jobLocks.model`,
];

function checkRemovedSpecifiers(consumerRoot) {
  const consumerRequire = createRequire(
    path.join(consumerRoot, "package.json"),
  );
  for (const specifier of REMOVED_SPECIFIERS) {
    let resolved;
    try {
      resolved = consumerRequire.resolve(specifier);
    } catch (error) {
      if (
        !["MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"].includes(
          error.code,
        )
      )
        throw error;
    }
    if (resolved)
      throw new Error(`Removed contract remains resolvable: ${resolved}`);
  }
  console.log(
    `${REMOVED_SPECIFIERS.length} removed contracts stay unresolvable.`,
  );
}

async function checkEntrypoints(consumerRoot, packageDir) {
  const packedManifest = readJson(path.join(packageDir, "package.json"));
  const specifiers = collectPublicSpecifiers(packageDir, packedManifest);
  const results = await runPool(specifiers, (specifier) =>
    checkEntrypoint(consumerRoot, specifier),
  );
  reportRuntimeFailures(results.filter(Boolean), specifiers.length);
  console.log(
    `All ${specifiers.length} packed entrypoints of ${packedManifest.name} load cleanly.`,
  );
}

/**
 * The runtime loads the automation interface lazily and swallows the missing
 * module, so its lifecycle has to stay inert rather than throw when the
 * optional package is not installed.
 */
async function checkAutomationRuntimeWithoutInterface(
  consumerRoot,
  packageDir,
) {
  const entrypoint = path.join(packageDir, "dist", "automation", "index.js");
  const source = `
const automation = require(${JSON.stringify(entrypoint)});
Promise.resolve()
  .then(() => automation.registerAutomationNodes())
  .then(() => automation.unregisterAutomationNodes())
  .catch((error) => { console.error(error); process.exitCode = 1; });
`;
  await execFileAsync(process.execPath, ["-e", source], { cwd: consumerRoot });
  console.log(
    "Optional automation lifecycle is inert when its interface is absent.",
  );
}

/**
 * The mirror image: the packed runtime must reach the optional interface from
 * its own location once a consumer installs it, which is what its lazy
 * `import()` of the bare specifier depends on.
 */
async function checkAutomationRuntimeWithInterface(consumerRoot, packageDir) {
  const entrypoint = path.join(packageDir, "dist", "automation", "index.js");
  const source = `
const { createRequire } = require("node:module");
require(${JSON.stringify(entrypoint)});
const requireFromPacked = createRequire(${JSON.stringify(entrypoint)});
const automationInterface = requireFromPacked(${JSON.stringify(OPTIONAL_AUTOMATION_INTERFACE)});
for (const name of ${JSON.stringify(AUTOMATION_REGISTRATION_FUNCTIONS)}) {
  if (typeof automationInterface[name] !== "function") {
    throw new Error(name + " is missing from " + requireFromPacked.resolve(${JSON.stringify(OPTIONAL_AUTOMATION_INTERFACE)}) + ".");
  }
}
`;
  await execFileAsync(process.execPath, ["-e", source], { cwd: consumerRoot });
  console.log(
    "The packed automation entry reaches its optional interface when installed.",
  );
}

async function checkTypeScriptConsumers(consumerRoot) {
  const configs = writeTypeScriptConfigs(consumerRoot);
  for (const config of configs) {
    await runPnpm(["exec", "tsc", "--project", config], consumerRoot);
    console.log(`${config} resolves the representative public surface.`);
  }
}

function installedPackageDir(consumerRoot, packageName) {
  return fs.realpathSync(path.join(consumerRoot, "node_modules", packageName));
}

async function installConsumer(
  temporaryRoot,
  archives,
  withAutomationInterface,
) {
  const consumerRoot = path.join(
    temporaryRoot,
    withAutomationInterface ? "consumer-with-automation" : "consumer",
  );
  fs.mkdirSync(consumerRoot);
  createConsumer(
    consumerRoot,
    archives.archivePath,
    archives.interfaceArchivePath,
    withAutomationInterface,
  );
  const installArgs = ["install", "--prefer-offline"];
  if (!withAutomationInterface) installArgs.push("--no-optional");
  await runPnpm(installArgs, consumerRoot);
  console.log(
    `Packed consumer installed ${withAutomationInterface ? "with" : "without"} the optional automation interface.`,
  );
  return consumerRoot;
}

async function checkConsumerWithoutAutomationInterface(consumerRoot) {
  const packageDir = installedPackageDir(consumerRoot, manifest.name);
  const interfaceDir = installedPackageDir(
    consumerRoot,
    interfaceManifest.name,
  );
  checkOptionalInterfaceIsAbsent(consumerRoot);
  checkCanonicalApiInterface(consumerRoot, packageDir);
  checkRemovedSpecifiers(consumerRoot);
  await checkEntrypoints(consumerRoot, packageDir);
  await checkEntrypoints(consumerRoot, interfaceDir);
  await checkAutomationRuntimeWithoutInterface(consumerRoot, packageDir);
  await checkTypeScriptConsumers(consumerRoot);
}

async function checkConsumerWithAutomationInterface(consumerRoot) {
  checkOptionalInterfaceIsPresent(consumerRoot);
  await checkAutomationRuntimeWithInterface(
    consumerRoot,
    installedPackageDir(consumerRoot, manifest.name),
  );
}

async function checkPackage() {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "dms-package-check-"),
  );
  const archives = {
    archivePath: path.join(temporaryRoot, PACKAGE_ARCHIVE_NAME),
    interfaceArchivePath: path.join(temporaryRoot, INTERFACE_ARCHIVE_NAME),
  };
  try {
    await runPnpm(
      ["pack", "--out", archives.archivePath, "--silent"],
      packageRoot,
    );
    await runPnpm(
      ["pack", "--out", archives.interfaceArchivePath, "--silent"],
      interfacePackageRoot,
    );
    await checkConsumerWithoutAutomationInterface(
      await installConsumer(temporaryRoot, archives, false),
    );
    await checkConsumerWithAutomationInterface(
      await installConsumer(temporaryRoot, archives, true),
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

await checkPackage();
