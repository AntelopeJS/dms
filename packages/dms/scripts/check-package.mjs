import { execFile } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifest = readJson(path.join(packageRoot, "package.json"));
const interfacePackageRoot = path.join(packageRoot, "..", "interface-dms");
const interfaceManifest = readJson(
  path.join(interfacePackageRoot, "package.json"),
);

const CONCURRENCY = 8;
const API_PACKAGE_NAME = "@antelopejs/api";
const API_PACKAGE_VERSION = "1.2.4";
const API_INTERFACE_PACKAGE_NAME = "@antelopejs/interface-api";
const UNAVAILABLE_OPTIONAL_PACKAGE = "@antelopejs/interface-dms-automation";
const CODE_EXTENSIONS = new Set([".cjs", ".js", ".mjs"]);
const PACKAGE_ARCHIVE_NAME = "package.tgz";
const INTERFACE_ARCHIVE_NAME = "interface-dms.tgz";
const SOURCE_FILE_NAME = "consumer.ts";
const TYPESCRIPT_CONFIGS = [
  ["node", "commonjs"],
  ["Node16", "Node16"],
];
const CONSUMER_SOURCE = `
import { construct, type Config } from "@antelopejs/dms";
import { SettingsIndexPage } from "@antelopejs/dms/pages";
import { AuthUser, type TenantTokenInput } from "@antelopejs/interface-dms/auth";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { memberSettingDataAPI } from "@antelopejs/interface-dms/data-controllers";
import { Grid, type GridOptions, type ChartColorToken } from "@antelopejs/interface-dms/base";
import type { ChartColorValue } from "@antelopejs/interface-dms/base/chart";
import { DataType, type DataTypeSerialized } from "@antelopejs/interface-dms/base/data-types";
import { Color, type JsonValue } from "@antelopejs/interface-dms/base/types";
import { RegisterHtmlTemplate, type HtmlTemplateRef } from "@antelopejs/interface-dms/html-render";
import { Notification, SystemCategory } from "@antelopejs/interface-dms/notifications";
import { CORE_SCHEMA_NAME } from "@antelopejs/interface-dms/constants";
import { PageController, type PageInfo } from "@antelopejs/interface-dms/page";
import { TableView, type TableViewOptions } from "@antelopejs/interface-dms/base/table-view";
import { Component } from "@antelopejs/interface-dms/component";

const runtimeSurface = [
  construct,
  SettingsIndexPage,
  AuthUser,
  UserModel,
  TenantModel,
  memberSettingDataAPI,
  Grid,
  DataType,
  Color,
  RegisterHtmlTemplate,
  Notification,
  SystemCategory,
  CORE_SCHEMA_NAME,
  PageController,
  TableView,
  Component,
];
const config = undefined as Config | undefined;
const token = undefined as TenantTokenInput | undefined;
const grid = undefined as GridOptions | undefined;
const dataType = undefined as DataTypeSerialized | undefined;
const json = undefined as JsonValue | undefined;
const template = undefined as HtmlTemplateRef | undefined;
const page = undefined as PageInfo | undefined;
const table = undefined as TableViewOptions | undefined;
const shade: ChartColorToken = "primary-500";
const chartColors: ChartColorValue[] = [shade, "neutral-950", "--usage", "var(--usage)"];
// @ts-expect-error Nuxt UI does not define this shade step.
const invalidShade: ChartColorToken = "primary-123";
// @ts-expect-error The generic job-lock contract was removed.
import type { JobLockModel } from "@antelopejs/interface-dms/job-locks";
void [runtimeSurface, config, token, grid, dataType, json, template, page, table, chartColors, invalidShade];
`;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

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

/**
 * The runtime depends on the interface by version. What this check is about is
 * the pair that was just packed, so the tarball wins over whatever the registry
 * holds -- and before the first release there is nothing there.
 */
function createConsumer(consumerRoot, archivePath, interfaceArchivePath) {
  const interfaceSpecifier = `file:${interfaceArchivePath}`;
  if (
    !(UNAVAILABLE_OPTIONAL_PACKAGE in (manifest.optionalDependencies ?? {}))
  ) {
    throw new Error(
      `${UNAVAILABLE_OPTIONAL_PACKAGE} must remain declared as optional.`,
    );
  }
  const availableOptionalDependencies = Object.fromEntries(
    Object.entries(manifest.optionalDependencies ?? {}).filter(
      ([packageName]) => packageName !== UNAVAILABLE_OPTIONAL_PACKAGE,
    ),
  );
  const packageJson = {
    name: "dms-package-contract-consumer",
    version: "1.0.0",
    private: true,
    packageManager: manifest.packageManager,
    dependencies: {
      [manifest.name]: `file:${archivePath}`,
      [interfaceManifest.name]: interfaceSpecifier,
      [API_PACKAGE_NAME]: API_PACKAGE_VERSION,
      ...availableOptionalDependencies,
    },
    devDependencies: {
      "@types/node": manifest.devDependencies["@types/node"],
      typescript: manifest.devDependencies.typescript,
    },
    // pnpm 10 reads the override here, pnpm 11 from `pnpm-workspace.yaml`.
    pnpm: { overrides: { [interfaceManifest.name]: interfaceSpecifier } },
  };
  fs.writeFileSync(
    path.join(consumerRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(consumerRoot, "pnpm-workspace.yaml"),
    `packages:\n  - "."\noverrides:\n  "${interfaceManifest.name}": "${interfaceSpecifier}"\n`,
  );
  fs.writeFileSync(path.join(consumerRoot, SOURCE_FILE_NAME), CONSUMER_SOURCE);
}

function checkUnavailableOptionalPackage(consumerRoot) {
  const scopedRequire = createRequire(path.join(consumerRoot, "package.json"));
  try {
    scopedRequire.resolve(UNAVAILABLE_OPTIONAL_PACKAGE);
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      console.log(
        `${UNAVAILABLE_OPTIONAL_PACKAGE} is absent from the consumer as intended.`,
      );
      return;
    }
    throw error;
  }
  throw new Error(`${UNAVAILABLE_OPTIONAL_PACKAGE} unexpectedly resolved.`);
}

function createTypeScriptConfig(moduleResolution, module) {
  return {
    compilerOptions: {
      moduleResolution,
      module,
      target: "ES2022",
      strict: true,
      noEmit: true,
    },
    files: [SOURCE_FILE_NAME],
  };
}

function writeTypeScriptConfigs(consumerRoot) {
  return TYPESCRIPT_CONFIGS.map(([moduleResolution, module]) => {
    const fileName = `tsconfig.${moduleResolution.toLowerCase()}.json`;
    const config = createTypeScriptConfig(moduleResolution, module);
    fs.writeFileSync(
      path.join(consumerRoot, fileName),
      `${JSON.stringify(config, null, 2)}\n`,
    );
    return fileName;
  });
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

async function checkAbsentAutomationRuntime(consumerRoot, packageDir) {
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

async function checkTypeScriptConsumers(consumerRoot) {
  const configs = writeTypeScriptConfigs(consumerRoot);
  for (const config of configs) {
    await runPnpm(["exec", "tsc", "--project", config], consumerRoot);
    console.log(`${config} resolves the representative public surface.`);
  }
}

async function checkPackage() {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "dms-package-check-"),
  );
  const archivePath = path.join(temporaryRoot, PACKAGE_ARCHIVE_NAME);
  const interfaceArchivePath = path.join(temporaryRoot, INTERFACE_ARCHIVE_NAME);
  const consumerRoot = path.join(temporaryRoot, "consumer");
  fs.mkdirSync(consumerRoot);
  try {
    await runPnpm(["pack", "--out", archivePath, "--silent"], packageRoot);
    await runPnpm(
      ["pack", "--out", interfaceArchivePath, "--silent"],
      interfacePackageRoot,
    );
    createConsumer(consumerRoot, archivePath, interfaceArchivePath);
    await runPnpm(
      ["install", "--prefer-offline", "--no-optional"],
      consumerRoot,
    );
    const packageDir = fs.realpathSync(
      path.join(consumerRoot, "node_modules", manifest.name),
    );
    console.log(
      "Packed consumer installed without the unavailable private optional dependency.",
    );
    const interfaceDir = fs.realpathSync(
      path.join(consumerRoot, "node_modules", interfaceManifest.name),
    );
    checkUnavailableOptionalPackage(consumerRoot);
    checkCanonicalApiInterface(consumerRoot, packageDir);
    checkRemovedSpecifiers(consumerRoot);
    await checkEntrypoints(consumerRoot, packageDir);
    await checkEntrypoints(consumerRoot, interfaceDir);
    await checkAbsentAutomationRuntime(consumerRoot, packageDir);
    await checkTypeScriptConsumers(consumerRoot);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

await checkPackage();
