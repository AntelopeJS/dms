import fs from "node:fs";
import path from "node:path";
import {
  isOptionalString,
  isStringRecord,
  isPlainObject,
} from "../../../../implementations/dms-builder/engine";

/** A module's `dmsBuilder` record, in its current shape or the one dms-builder 0.6 wrote. */
export interface BuilderRecord {
  database?: {
    connection?: string;
    excludedTables?: Record<string, string>;
  };
  mapped?: string;
  excluded?: Record<string, string>;
}

function isBuilderRecord(value: unknown): value is BuilderRecord {
  if (!isPlainObject(value)) {
    return false;
  }
  const { database } = value;
  return (
    isOptionalString(value.mapped) &&
    (value.excluded === undefined || isStringRecord(value.excluded)) &&
    (database === undefined ||
      (isPlainObject(database) &&
        isOptionalString(database.connection) &&
        (database.excludedTables === undefined ||
          isStringRecord(database.excludedTables))))
  );
}

function manifestFile(root: string, module: string): string {
  return path.join(root, "modules", module, "package.json");
}

/** The `dmsBuilder` record in a fixture module's `package.json`. */
export function builderRecord(root: string, module: string): BuilderRecord {
  const manifest: unknown = JSON.parse(
    fs.readFileSync(manifestFile(root, module), "utf8"),
  );
  if (!isPlainObject(manifest) || !isBuilderRecord(manifest.dmsBuilder)) {
    throw new Error(
      `modules/${module}/package.json holds no dmsBuilder record`,
    );
  }
  return manifest.dmsBuilder;
}

/** Replaces the `dmsBuilder` record in a fixture module's `package.json`. */
export function setBuilderRecord(
  root: string,
  module: string,
  record: BuilderRecord,
): void {
  const file = manifestFile(root, module);
  const manifest: unknown = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : { name: module };
  if (!isPlainObject(manifest)) {
    throw new Error(`modules/${module}/package.json is not an object`);
  }
  fs.writeFileSync(file, JSON.stringify({ ...manifest, dmsBuilder: record }));
}

/** Whether a fixture module's folder exists. */
export function moduleFolderExists(root: string, module: string): boolean {
  return fs.existsSync(path.join(root, "modules", module));
}
