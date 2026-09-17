/**
 * What the scratch project `check-package.mjs` installs the packed tarballs
 * into: its manifest, its pnpm overrides, the representative TypeScript source
 * and the tsconfigs that resolve it. The assertions against that project live
 * in `check-package.mjs`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const interfacePackageRoot = path.join(
  packageRoot,
  "..",
  "interface-dms",
);

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export const manifest = readJson(path.join(packageRoot, "package.json"));
export const interfaceManifest = readJson(
  path.join(interfacePackageRoot, "package.json"),
);

export const API_PACKAGE_NAME = "@antelopejs/api";
export const API_PACKAGE_VERSION = "1.2.4";
export const OPTIONAL_AUTOMATION_INTERFACE =
  "@antelopejs/interface-dms-automation";

const SOURCE_FILE_NAME = "consumer.ts";
const TYPESCRIPT_CONFIGS = [
  ["node", "commonjs"],
  ["Node16", "Node16"],
];
const CONSUMER_SOURCE = `
import { construct, type Config } from "@antelopejs/dms";
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

function readAutomationInterfaceRange() {
  const range = (manifest.optionalDependencies ?? {})[
    OPTIONAL_AUTOMATION_INTERFACE
  ];
  if (!range) {
    throw new Error(
      `${OPTIONAL_AUTOMATION_INTERFACE} must remain declared as optional.`,
    );
  }
  return range;
}

/**
 * The runtime depends on the interface by version. What this check is about is
 * the pair that was just packed, so the tarball wins over whatever the registry
 * holds -- and before the first release there is nothing there.
 */
function buildConsumerManifest(
  archivePath,
  interfaceSpecifier,
  withAutomationInterface,
) {
  const automationRange = readAutomationInterfaceRange();
  const overrides = { [interfaceManifest.name]: interfaceSpecifier };
  const dependencies = {
    [manifest.name]: `file:${archivePath}`,
    [interfaceManifest.name]: interfaceSpecifier,
    [API_PACKAGE_NAME]: API_PACKAGE_VERSION,
    ...Object.fromEntries(
      Object.entries(manifest.optionalDependencies).filter(
        ([packageName]) => packageName !== OPTIONAL_AUTOMATION_INTERFACE,
      ),
    ),
  };
  if (withAutomationInterface) {
    dependencies[OPTIONAL_AUTOMATION_INTERFACE] = automationRange;
  } else {
    // `-` drops a package from the resolution altogether. Asking for the
    // removal by name is what makes the absence deterministic: `--no-optional`
    // only covers what the manifests flag as optional, and the automation
    // interface is a real package on the registry that anything could pull in.
    overrides[OPTIONAL_AUTOMATION_INTERFACE] = "-";
  }
  return {
    name: withAutomationInterface
      ? "dms-package-contract-consumer-with-automation"
      : "dms-package-contract-consumer",
    version: "1.0.0",
    private: true,
    packageManager: manifest.packageManager,
    dependencies,
    devDependencies: {
      "@types/node": manifest.devDependencies["@types/node"],
      typescript: manifest.devDependencies.typescript,
    },
    // pnpm 10 reads the overrides here, pnpm 11 from `pnpm-workspace.yaml`.
    pnpm: { overrides },
  };
}

export function createConsumer(
  consumerRoot,
  archivePath,
  interfaceArchivePath,
  withAutomationInterface,
) {
  const packageJson = buildConsumerManifest(
    archivePath,
    `file:${interfaceArchivePath}`,
    withAutomationInterface,
  );
  const overrideLines = Object.entries(packageJson.pnpm.overrides)
    .map(([packageName, specifier]) => `  "${packageName}": "${specifier}"`)
    .join("\n");
  fs.writeFileSync(
    path.join(consumerRoot, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(consumerRoot, "pnpm-workspace.yaml"),
    `packages:\n  - "."\noverrides:\n${overrideLines}\n`,
  );
  fs.writeFileSync(path.join(consumerRoot, SOURCE_FILE_NAME), CONSUMER_SOURCE);
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

export function writeTypeScriptConfigs(consumerRoot) {
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
