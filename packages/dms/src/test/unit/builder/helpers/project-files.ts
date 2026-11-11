import fs from "node:fs";
import path from "node:path";
import {
  isOptionalString,
  isStringRecord,
} from "../../../../implementations/dms-builder/engine/guards";
import { isPlainObject } from "../../../../implementations/dms-builder/engine/value";

/** The fields of a `package.json` the tests read. */
export interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** The fields of a `tsconfig.json` the tests read. */
export interface TsConfigFile {
  compilerOptions?: {
    strict?: boolean;
    module?: string;
    experimentalDecorators?: boolean;
    emitDecoratorMetadata?: boolean;
    rootDir?: string;
  };
}

function isPackageManifest(value: unknown): value is PackageManifest {
  return (
    isPlainObject(value) &&
    (value.dependencies === undefined || isStringRecord(value.dependencies)) &&
    (value.devDependencies === undefined ||
      isStringRecord(value.devDependencies))
  );
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isTsConfigFile(value: unknown): value is TsConfigFile {
  if (!isPlainObject(value)) {
    return false;
  }
  const options = value.compilerOptions;
  return (
    options === undefined ||
    (isPlainObject(options) &&
      isOptionalBoolean(options.strict) &&
      isOptionalString(options.module) &&
      isOptionalBoolean(options.experimentalDecorators) &&
      isOptionalBoolean(options.emitDecoratorMetadata) &&
      isOptionalString(options.rootDir))
  );
}

/** A fixture project's file, as text. */
export function projectFile(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

/** The names a fixture project's directory holds. */
export function projectDirectory(root: string, relativePath: string): string[] {
  return fs.readdirSync(path.join(root, relativePath));
}

/** A `package.json` under a fixture project, or the builder's own when `root` is its package. */
export function packageManifest(
  root: string,
  relativePath: string,
): PackageManifest {
  const parsed: unknown = JSON.parse(projectFile(root, relativePath));
  if (!isPackageManifest(parsed)) {
    throw new Error(`${relativePath} is not a package manifest the tests read`);
  }
  return parsed;
}

/** A `tsconfig.json` under a fixture project. */
export function tsConfigFile(root: string, relativePath: string): TsConfigFile {
  const parsed: unknown = JSON.parse(projectFile(root, relativePath));
  if (!isTsConfigFile(parsed)) {
    throw new Error(`${relativePath} is not a tsconfig the tests read`);
  }
  return parsed;
}

/**
 * Runs `check` while a fixture file holds what `edit` makes of it, and puts the file back after,
 * whether `check` passes or not, so a failure does not leak into the tests that follow.
 */
export async function withFileEdited(
  root: string,
  relativePath: string,
  edit: (text: string) => string,
  check: () => void | Promise<void>,
): Promise<void> {
  const file = path.join(root, relativePath);
  const before = fs.readFileSync(file, "utf8");
  fs.writeFileSync(file, edit(before));
  try {
    await check();
  } finally {
    fs.writeFileSync(file, before);
  }
}
