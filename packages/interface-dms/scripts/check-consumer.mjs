// Consumers compile against the packed tarball, not the sources, and most of
// them are still on `moduleResolution: node` with `skipLibCheck: false`. Both
// resolvers have to find every documented entry point, and the emitted
// declarations have to typecheck on their own.
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
);

const RESOLUTIONS = [
  ["node", "commonjs"],
  ["Node16", "Node16"],
  ["bundler", "preserve"],
];

const CONSUMER_SOURCE = `
import { CORE_SCHEMA_NAME, PageController, RegisterPermission } from "@antelopejs/interface-dms";
import { AuthUser, type TenantTokenInput } from "@antelopejs/interface-dms/auth";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { Grid, type GridOptions, type ChartColorToken } from "@antelopejs/interface-dms/base";
import { Color, type JsonValue } from "@antelopejs/interface-dms/base/types";
import { DataType, type DataTypeSerialized } from "@antelopejs/interface-dms/base/data-types";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { TableView, type TableViewOptions } from "@antelopejs/interface-dms/base/table-view";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { memberSettingDataAPI } from "@antelopejs/interface-dms/data-controllers";
import { AddFrontendModule, type PageInfo } from "@antelopejs/interface-dms/page";
import { AuthTenantMember } from "@antelopejs/interface-dms/guards";
import { Notification, SystemCategory } from "@antelopejs/interface-dms/notifications";
import { RegisterHtmlTemplate, type HtmlTemplateRef } from "@antelopejs/interface-dms/html-render";
import { Component } from "@antelopejs/interface-dms/component";
// A consumer on node resolution finds our types through typesVersions and
// writes that dist/... form into the declarations it emits; the next consumer
// down the chain has to resolve them too, for a file and a directory alike.
import type { ChartColorValue as DistFileType } from "@antelopejs/interface-dms/dist/base/chart";
import type { TableViewOptions as DistDirectoryType } from "@antelopejs/interface-dms/dist/base";

const surface = [
  CORE_SCHEMA_NAME,
  PageController,
  RegisterPermission,
  AuthUser,
  UserModel,
  Grid,
  Color,
  DataType,
  DefaultDataTypes,
  TableView,
  TenantModel,
  memberSettingDataAPI,
  AddFrontendModule,
  AuthTenantMember,
  Notification,
  SystemCategory,
  RegisterHtmlTemplate,
  Component,
];
const token = undefined as TenantTokenInput | undefined;
const grid = undefined as GridOptions | undefined;
const json = undefined as JsonValue | undefined;
const dataType = undefined as DataTypeSerialized | undefined;
const table = undefined as TableViewOptions | undefined;
const page = undefined as PageInfo | undefined;
const template = undefined as HtmlTemplateRef | undefined;
const shade: ChartColorToken = "primary-500";
const distFile = undefined as DistFileType | undefined;
const distDirectory = undefined as DistDirectoryType | undefined;

// A Nuxt-layer module registers its frontend the same way the DMS does.
AddFrontendModule({
  name: "@scope/module",
  sourcePath: "/tmp/module/frontend-vue",
  renderer: { name: "vue", version: "3" },
});

// @ts-expect-error The generic job-lock contract was removed.
import type { JobLockModel } from "@antelopejs/interface-dms/job-locks";

void [surface, token, grid, json, dataType, table, page, template, shade, distFile, distDirectory];
`;

function runPnpm(args, cwd) {
  return execFileAsync("pnpm", args, {
    cwd,
    env: { ...process.env, npm_config_ignore_scripts: "true" },
  });
}

async function main() {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "interface-dms-consumer-"),
  );
  const archivePath = path.join(temporaryRoot, "interface-dms.tgz");
  const consumerRoot = path.join(temporaryRoot, "consumer");
  fs.mkdirSync(consumerRoot);
  try {
    await runPnpm(["pack", "--out", archivePath, "--silent"], packageRoot);
    fs.writeFileSync(
      path.join(consumerRoot, "package.json"),
      `${JSON.stringify(
        {
          name: "interface-dms-consumer",
          version: "1.0.0",
          private: true,
          packageManager: manifest.packageManager,
          dependencies: {
            [manifest.name]: `file:${archivePath}`,
            ...manifest.peerDependencies,
          },
          devDependencies: {
            "@types/node": manifest.devDependencies["@types/node"],
            typescript: manifest.devDependencies.typescript,
          },
        },
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(path.join(consumerRoot, "consumer.ts"), CONSUMER_SOURCE);
    await runPnpm(["install", "--prefer-offline"], consumerRoot);

    for (const [moduleResolution, module] of RESOLUTIONS) {
      const configName = `tsconfig.${moduleResolution.toLowerCase()}.json`;
      fs.writeFileSync(
        path.join(consumerRoot, configName),
        `${JSON.stringify(
          {
            compilerOptions: {
              moduleResolution,
              module,
              target: "ES2022",
              strict: true,
              noEmit: true,
              skipLibCheck: false,
              experimentalDecorators: true,
              emitDecoratorMetadata: true,
            },
            files: ["consumer.ts"],
          },
          null,
          2,
        )}\n`,
      );
      await runPnpm(["exec", "tsc", "--project", configName], consumerRoot);
      console.log(`${moduleResolution} resolves the public surface.`);
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
