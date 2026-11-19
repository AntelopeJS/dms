import fs from "node:fs";
import path from "node:path";
import type {
  ConfigValue,
  ExcludedRelation,
} from "@antelopejs/interface-dms-builder";
import { ts } from "ts-morph";
import { moduleOfFile, targetModule } from "./modules";
import { resolveProjectRoot } from "./project";
import { StepRefusal } from "./project-config";
import { rowValueDigest, rowValuesOf } from "./row-literals";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./plain-object";

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
  /**
   * The {@link rowValueDigest} of each value from rows a mapping wrote into the module. A module
   * mapped before dms recorded them, or while a mapping writes, has none, and all of its row
   * literals count as written.
   */
  rowLiterals?: string[];
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

function isOptionalTextList(value: unknown): value is string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every(isString));
}

function isDatabaseRecord(value: unknown): value is DatabaseRecord {
  return (
    isPlainObject(value) &&
    isOptionalString(value.connection) &&
    isOptionalTextRecord(value.excludedTables) &&
    isOptionalTextList(value.rowLiterals)
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
    rowLiterals: builder?.database?.rowLiterals,
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
  if (record.rowLiterals !== undefined) {
    database.rowLiterals = record.rowLiterals;
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
    rowLiterals: current.rowLiterals,
  });
}

/**
 * Writes the digests of a mapped module's record, and answers the ones it kept. A module no
 * mapping bound to a connection yet holds no value from rows: it is left without a record, and
 * kept none to read back.
 */
function writeRowLiterals(
  module: string,
  digests: string[] | undefined,
): string[] | undefined {
  const root = targetModule(module)?.root;
  const current = root ? databaseRecord(readManifest(root)) : {};
  if (!root || current.connection === undefined) {
    return [];
  }
  writeDatabaseRecord(root, { ...current, rowLiterals: digests });
  return current.rowLiterals;
}

/**
 * Drops the digests a module's record keeps, so its row literals all count as written until
 * {@link recordRowLiterals} writes them back, and answers them. A module mapped before dms
 * recorded them answers none.
 */
export function suspendRowLiterals(module: string): string[] | undefined {
  return writeRowLiterals(module, undefined);
}

/** Writes the digests of the values from rows a mapping wrote into a module into its record. */
export function recordRowLiterals(module: string, digests: string[]): void {
  writeRowLiterals(module, [...new Set(digests)].sort());
}

/** The connection the module holding a file mirrors, when that module is a mapped one. */
export function mappedConnectionOfFile(filepath: string): string | undefined {
  const root = moduleOfFile(filepath)?.root;
  return root ? recordedConnection(root) : undefined;
}

/** The files a file imports by a relative path. */
function relativeImportsOf(filepath: string): string[] {
  if (!fs.existsSync(filepath)) {
    return [];
  }
  const { importedFiles } = ts.preProcessFile(
    fs.readFileSync(filepath, "utf8"),
    true,
    true,
  );
  return importedFiles
    .filter(({ fileName }) => fileName.startsWith("."))
    .map(({ fileName }) => path.resolve(path.dirname(filepath), fileName));
}

/**
 * The roots of the mapped modules whose code a file may hold: its own module's, and those it
 * imports from by a relative path, as a mapped page moved into another module's category does.
 * Refused when one of their records cannot be read.
 */
function mappedRootsOf(filepath: string): string[] {
  const roots = [filepath, ...relativeImportsOf(filepath)].flatMap((file) => {
    const root = moduleOfFile(file)?.root;
    return root && recordedConnection(root) !== undefined ? [root] : [];
  });
  return [...new Set(roots)];
}

/**
 * Whether a file may hold code a mapping wrote from rows: it lies in a mapped module, or imports
 * from one by a relative path. A module whose record cannot be read counts as mapped.
 */
export function holdsMappedCode(filepath: string): boolean {
  try {
    return mappedRootsOf(filepath).length > 0;
  } catch (error) {
    if (error instanceof StepRefusal) {
      return true;
    }
    throw error;
  }
}

/** Whether a file may hold code of a module's mapping; so it may when its record cannot be read. */
export function holdsMappedCodeOf(filepath: string, module: string): boolean {
  const root = targetModule(module)?.root;
  try {
    return root !== undefined && mappedRootsOf(filepath).includes(root);
  } catch (error) {
    if (error instanceof StepRefusal) {
      return true;
    }
    throw error;
  }
}

/**
 * Which row literals of a file a mapping wrote: those holding a value whose digest the records
 * of the mapped modules the file holds code of keep. Every one when a record keeps no digests or cannot be
 * read, none when the file holds no mapped code.
 */
export function mappedLiteralTestOf(
  filepath: string,
): (value: ConfigValue) => boolean {
  try {
    const records = mappedRootsOf(filepath).map(
      (root) => databaseRecord(readManifest(root)).rowLiterals,
    );
    if (records.some((digests) => digests === undefined)) {
      return () => true;
    }
    const written = new Set(records.flat());
    return (value) =>
      rowValuesOf(value).some((item) => written.has(rowValueDigest(item)));
  } catch (error) {
    if (error instanceof StepRefusal) {
      return () => true;
    }
    throw error;
  }
}

/** The relations recorded as decided against in a module, with why. */
export function excludedRelationsOf(module: string): Record<string, string> {
  const root = targetModule(module)?.root;
  return root ? (databaseRecord(readManifest(root)).excludedTables ?? {}) : {};
}
