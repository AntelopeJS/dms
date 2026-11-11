import fs from "node:fs";
import path from "node:path";
import type { ExcludedRelation } from "@antelopejs/interface-dms-builder";
import { moduleOfFile, targetModule } from "./modules";
import { resolveProjectRoot } from "./project";
import { StepRefusal } from "./project-config";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./value";

const MANIFEST = "package.json";

interface MappedManifest {
  dmsBuilder?: BuilderManifest;
}

interface BuilderManifest {
  database?: DatabaseRecord;
  /** dms-builder 0.6 and earlier: the connection, read until the next save. */
  mapped?: string;
  /** dms-builder 0.6 and earlier: the excluded tables, read until the next save. */
  excluded?: Record<string, string>;
}

/** What a module bound to an external database records about it in its `package.json`. */
interface DatabaseRecord {
  connection?: string;
  /** Tables decided against, `"schema.name"` → why, so no analysis proposes them again. */
  excludedTables?: Record<string, string>;
}

/** What one `MapResources` call changes in the module's record. */
export interface MappedRecordUpdate {
  connection: string;
  mapped: string[];
  excluded: ExcludedRelation[];
}

function manifestPath(root: string): string {
  return path.join(root, MANIFEST);
}

const BYTE_ORDER_MARK = /^\uFEFF/;

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isOptionalTextRecord(
  value: unknown,
): value is Record<string, string> | undefined {
  return (
    value === undefined ||
    (isPlainObject(value) && Object.values(value).every(isString))
  );
}

function isDatabaseRecord(value: unknown): value is DatabaseRecord {
  return (
    isPlainObject(value) &&
    isOptionalString(value.connection) &&
    isOptionalTextRecord(value.excludedTables)
  );
}

function isBuilderManifest(value: unknown): value is BuilderManifest {
  return (
    isPlainObject(value) &&
    (value.database === undefined || isDatabaseRecord(value.database)) &&
    isOptionalString(value.mapped) &&
    isOptionalTextRecord(value.excluded)
  );
}

function isMappedManifest(value: unknown): value is MappedManifest {
  return (
    isPlainObject(value) &&
    (value.dmsBuilder === undefined || isBuilderManifest(value.dmsBuilder))
  );
}

/** A module's manifest; refused, naming the file, when it is not JSON or its builder record is malformed. */
function readManifest(root: string): MappedManifest {
  const file = manifestPath(root);
  if (!fs.existsSync(file)) {
    return {};
  }
  const shown = path.relative(resolveProjectRoot(), file);
  let manifest: unknown;
  try {
    manifest = JSON.parse(
      fs.readFileSync(file, "utf8").replace(BYTE_ORDER_MARK, ""),
    );
  } catch (error) {
    throw new StepRefusal(
      `${shown} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isMappedManifest(manifest)) {
    throw new StepRefusal(`${shown} has a malformed dmsBuilder record`);
  }
  return manifest;
}

function updatedExclusions(
  current: Record<string, string> | undefined,
  update: MappedRecordUpdate,
): Record<string, string> | undefined {
  const excluded = { ...current };
  for (const relation of update.mapped) {
    delete excluded[relation];
  }
  for (const entry of update.excluded) {
    excluded[entry.relation] = entry.reason;
  }
  return Object.keys(excluded).length > 0 ? excluded : undefined;
}

function databaseRecord(manifest: MappedManifest): DatabaseRecord {
  const builder = manifest.dmsBuilder;
  return {
    connection: builder?.database?.connection ?? builder?.mapped,
    excludedTables: builder?.database?.excludedTables ?? builder?.excluded,
  };
}

function recorded(
  manifest: MappedManifest,
  record: DatabaseRecord,
): MappedManifest {
  const {
    mapped: _mapped,
    excluded: _excluded,
    ...builder
  } = manifest.dmsBuilder ?? {};
  const database: DatabaseRecord = { connection: record.connection };
  if (record.excludedTables && Object.keys(record.excludedTables).length > 0) {
    database.excludedTables = record.excludedTables;
  }
  return { ...manifest, dmsBuilder: { ...builder, database } };
}

function manifestText(manifest: MappedManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function writeDatabaseRecord(root: string, record: DatabaseRecord): void {
  const manifest = readManifest(root);
  const next = recorded(manifest, record);
  if (JSON.stringify(next) === JSON.stringify(manifest)) {
    return;
  }
  fs.writeFileSync(manifestPath(root), manifestText(next));
}

/** The connection a module folder's record names, when the builder mapped tables into it. */
export function recordedConnection(root: string): string | undefined {
  return databaseRecord(readManifest(root)).connection;
}

/**
 * Marks a module as one whose tables mirror a database the project does not own, so the
 * operations that would create, alter or empty a table refuse there, and records which relations
 * were decided against.
 */
export function markMapped(module: string, update: MappedRecordUpdate): void {
  const root = targetModule(module)?.root;
  if (!root) {
    return;
  }
  const current = databaseRecord(readManifest(root));
  writeDatabaseRecord(root, {
    connection: update.connection,
    excludedTables: updatedExclusions(current.excludedTables, update),
  });
}

/** The connection the module holding a file mirrors, when that module is a mapped one. */
export function mappedConnectionOfFile(filepath: string): string | undefined {
  const root = moduleOfFile(filepath)?.root;
  return root ? recordedConnection(root) : undefined;
}

/** The relations recorded as decided against in a module, with why. */
export function excludedRelationsOf(module: string): Record<string, string> {
  const root = targetModule(module)?.root;
  return root ? (databaseRecord(readManifest(root)).excludedTables ?? {}) : {};
}
