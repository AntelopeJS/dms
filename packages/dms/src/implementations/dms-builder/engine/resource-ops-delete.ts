/** Deleting a resource, and cleaning up the directories it leaves empty. */

import { mappedConnectionOfFile } from "./mapped-modules";
import { writeRoutesRefusal } from "./connection-access";
import fs from "node:fs";
import path from "node:path";
import type {
  DeleteResourceOpts,
  FieldAspects,
  FieldSpec,
  MutationOpts,
  OpResult,
  OpWarning,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import { Node, type Project, type SourceFile } from "ts-morph";
import { applyImportRef, ensureNamedImport } from "./emit";
import { dropResourceData } from "./resource-data";
import {
  findResourceRecord,
  listResourceRecords,
  type ResourceRecord,
  resourceRefResolver,
} from "./resource-index";
import {
  indexedFieldNames,
  readDataApiFieldAspects,
  resourceVersion,
  tableFieldDeclarations,
} from "./resource-structure";
import {
  createImportCollector,
  type EmitContext,
  UnknownDataTypeError,
  UnknownReferenceError,
} from "./value";
import { findImporters, Transaction } from "./writable";
import {
  commit,
  duplicate,
  invalidConfig,
  invalidDataType,
  notFound,
} from "./ops";
import {
  openResource,
  parseFieldPath,
  refError,
  reservedFieldError,
} from "./resource-ops";
import {
  dataApiFieldText,
  decoratorImport,
  tableFieldText,
} from "./resource-emit-types";
import {
  type DecoratorSymbol,
  routeMapExpr,
  TABLE_VIEW_MODULE,
  withDefaultIndex,
} from "./resource-emit";
import { getExtendsCall } from "./literals";

function checkVersion(
  ref: string,
  databaseFile: SourceFile,
  dataApiFile: SourceFile,
  opts?: MutationOpts,
): OpResult<never> | undefined {
  if (!opts?.expectedVersion) {
    return undefined;
  }
  const current = resourceVersion(databaseFile, dataApiFile);
  if (current !== opts.expectedVersion) {
    return {
      ok: false,
      error: { code: "stale", ref, currentVersion: current },
    };
  }
  return undefined;
}

/**
 * The other resources whose code imports this one -- a relation field pointing
 * at it, typically. Deleting it would break their code and leave their rows
 * holding ids of rows that no longer exist, so the delete waits on them.
 */
function referencingResources(
  project: Project,
  record: ResourceRecord,
): string[] {
  const importing = new Set<string>(
    [record.databaseFile, record.dataApiFile, record.indexFile].flatMap(
      (target) =>
        findImporters(project, target).map((importer) =>
          importer.getSourceFile().getFilePath(),
        ),
    ),
  );
  return listResourceRecords()
    .filter(
      (other) =>
        other.ref !== record.ref &&
        (importing.has(other.databaseFile) || importing.has(other.dataApiFile)),
    )
    .map((other) => other.ref);
}
/** The refusal for an operation that would create or alter a column of a mapped module's table. */
function mappedRefusal(filepath: string): OpResult<never> | undefined {
  const connection = mappedConnectionOfFile(filepath);
  if (!connection) {
    return undefined;
  }
  return {
    ok: false,
    error: {
      code: "invalid_config",
      issues: [
        {
          pointer: "",
          message: `this table mirrors the "${connection}" database, whose columns are its own; map columns with MapResources`,
        },
      ],
    },
  };
}

export async function deleteResource(
  ref: string,
  opts?: DeleteResourceOpts,
): Promise<OpResult> {
  const record = findResourceRecord(ref);
  if (!record) {
    return notFound(ref);
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound(ref);
  }
  const stale = checkVersion(
    ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  const blockedBy = referencingResources(opened.project, record);
  if (blockedBy.length > 0) {
    return { ok: false, error: { code: "referential_integrity", blockedBy } };
  }
  const indexFile = opened.project.getSourceFile(record.indexFile);
  const transaction = new Transaction(opened.project);
  for (const importer of findImporters(opened.project, record.indexFile)) {
    transaction.track(importer.getSourceFile());
    importer.remove();
  }
  transaction.trackDelete(opened.databaseFile);
  transaction.trackDelete(opened.dataApiFile);
  if (indexFile) {
    transaction.trackDelete(indexFile);
  }
  const mapped = mappedConnectionOfFile(record.databaseFile);
  const result = commit(transaction, undefined);
  if (!result.ok) {
    return result;
  }
  removeEmptyDir(path.dirname(record.databaseFile));
  if (mapped) {
    return {
      ...result,
      warnings: [
        ...(result.warnings ?? []),
        {
          code: "data_kept",
          message: `the rows of "${ref}" belong to the "${mapped}" database and were left in place`,
        },
      ],
    };
  }
  if (opts?.keepData) {
    return result;
  }
  const failure = await dropResourceData(record.schema, record.tableName);
  if (!failure) {
    return result;
  }
  return {
    ...result,
    warnings: [
      ...(result.warnings ?? []),
      {
        code: "data_not_dropped",
        message: `could not delete table data for "${ref}" (${failure}); it may retain stale documents`,
      },
    ],
  };
}

function removeEmptyDir(dir: string): void {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

function applyFieldImports(
  sourceFile: SourceFile,
  symbols: DecoratorSymbol[],
): void {
  for (const symbol of symbols) {
    applyImportRef(sourceFile, decoratorImport(symbol));
  }
}

/** A field's table and Data API text, the decorators each needs, and the emit warnings. */
interface FieldText {
  table: string;
  tableSymbols: DecoratorSymbol[];
  api: string;
  apiSymbols: DecoratorSymbol[];
  warnings: OpWarning[];
}

function buildFieldText(spec: FieldSpec, ctx: EmitContext): FieldText {
  const table = tableFieldText(spec);
  const api = dataApiFieldText(spec, ctx);
  return {
    table: table.text.trim(),
    tableSymbols: table.symbols,
    api: api.text.trim(),
    apiSymbols: api.symbols,
    warnings: table.warnings,
  };
}

export function addField(
  ref: string,
  spec: FieldSpec,
  opts?: MutationOpts,
): OpResult<{ path: string }> {
  const reserved = reservedFieldError(spec.name);
  if (reserved) {
    return reserved;
  }
  const record = findResourceRecord(ref);
  if (!record) {
    return notFound<{ path: string }>(ref);
  }
  const mapped = mappedRefusal(record.databaseFile);
  if (mapped) {
    return mapped;
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound<{ path: string }>(ref);
  }
  const stale = checkVersion(
    ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  if (
    opened.dataApiClass.getProperty(spec.name) ||
    opened.tableClass.getProperty(spec.name)
  ) {
    return duplicate<{ path: string }>(spec.name, "resource");
  }
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  let built: ReturnType<typeof buildFieldText>;
  try {
    built = buildFieldText(withDefaultIndex(spec), ctx);
  } catch (error) {
    if (error instanceof UnknownDataTypeError) {
      return invalidDataType<{ path: string }>(error);
    }
    if (error instanceof UnknownReferenceError) {
      return refError(error);
    }
    throw error;
  }
  const transaction = new Transaction(opened.project);
  transaction.track(opened.databaseFile);
  transaction.track(opened.dataApiFile);
  opened.tableClass.addMember(built.table);
  opened.dataApiClass.addMember(built.api);
  applyFieldImports(opened.databaseFile, built.tableSymbols);
  applyFieldImports(opened.dataApiFile, built.apiSymbols);
  for (const importRef of imports) {
    applyImportRef(opened.dataApiFile, importRef);
  }
  return commit(transaction, { path: `${ref}#${spec.name}` }, built.warnings);
}

/**
 * Walks a field path down to the two property declarations that back it -- one
 * on the data API class, one on the table class -- and the aspects currently
 * written there. Refuses a path that does not parse, a resource or field that
 * is gone, a stale version, or a field whose declaration was hand-edited past
 * what the builder can describe.
 */
function locateField(fieldPath: string, opts: MutationOpts | undefined) {
  const parsed = parseFieldPath(fieldPath);
  if (!parsed) {
    return notFound(fieldPath);
  }
  const record = findResourceRecord(parsed.ref);
  if (!record) {
    return notFound(fieldPath);
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound(fieldPath);
  }
  const stale = checkVersion(
    parsed.ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  const dataApiProp = opened.dataApiClass.getProperty(parsed.field);
  const tableProp = opened.tableClass.getProperty(parsed.field);
  if (
    !dataApiProp ||
    !tableProp ||
    !Node.isPropertyDeclaration(dataApiProp) ||
    !Node.isPropertyDeclaration(tableProp)
  ) {
    return notFound(fieldPath);
  }
  const current = readDataApiFieldAspects(
    dataApiProp,
    indexedFieldNames(opened.tableClass),
    tableFieldDeclarations(opened.tableClass),
  );
  if (current.opaque || !current.dataType) {
    return {
      ok: false as const,
      error: { code: "opaque_target" as const, path: fieldPath },
    };
  }
  return {
    parsed,
    opened,
    dataApiProp,
    tableProp,
    current,
    dataType: current.dataType,
  };
}

/**
 * The field as it will be written: each aspect from the patch, else the one
 * currently declared. The column keeps how it is declared unless the DataType
 * itself changes, and options the builder has no aspect for are carried over
 * untouched, so a patch is never what drops a field's `defaultValue`.
 */
function mergeFieldAspects(
  located: Extract<ReturnType<typeof locateField>, { opened: unknown }>,
  patch: Partial<FieldAspects>,
): FieldSpec {
  const { parsed, current, dataType } = located;
  return {
    name: parsed.field,
    dataType: patch.dataType ?? dataType,
    label: patch.label ?? current.label,
    listable: patch.listable ?? current.listable,
    selectable: patch.selectable ?? current.selectable,
    searchable: patch.searchable ?? current.searchable,
    sortable: patch.sortable ?? current.sortable,
    filterable: patch.filterable ?? current.filterable,
    access: patch.access ?? current.access,
    required: patch.required ?? current.required,
    indexed: patch.indexed ?? current.indexed,
    order: patch.order ?? current.order,
    exported: patch.exported ?? current.exported,
    archiveField: patch.archiveField ?? current.archiveField,
    mandatory: patch.mandatory ?? current.mandatory,
    dbField: patch.dataType ? undefined : current.dbField,
    columnExtras: patch.columnExtras ?? current.columnExtras,
  };
}

/**
 * Change aspects of one field on both its classes. The table is rewritten only
 * when the patch touches the column's type or index: the table declares nothing
 * else, and reformatting a file the change does not affect is noise in the
 * author's diff.
 */
export function configureField(
  fieldPath: string,
  patch: Partial<FieldAspects>,
  opts?: MutationOpts,
): OpResult {
  const located = locateField(fieldPath, opts);
  if (!("opened" in located)) return located;
  const { opened, dataApiProp, tableProp } = located;
  if (patch.dbField !== undefined) {
    const mapped = mappedRefusal(opened.databaseFile.getFilePath());
    if (mapped) {
      return mapped;
    }
  }
  const merged = mergeFieldAspects(located, patch);
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  let built: ReturnType<typeof buildFieldText>;
  try {
    built = buildFieldText(merged, ctx);
  } catch (error) {
    if (error instanceof UnknownDataTypeError) {
      return invalidDataType(error);
    }
    if (error instanceof UnknownReferenceError) {
      return refError(error);
    }
    throw error;
  }
  const touchesTable =
    patch.dataType !== undefined || patch.indexed !== undefined;
  const transaction = new Transaction(opened.project);
  if (touchesTable) {
    transaction.track(opened.databaseFile);
    tableProp.replaceWithText(built.table);
    applyFieldImports(opened.databaseFile, built.tableSymbols);
  }
  transaction.track(opened.dataApiFile);
  dataApiProp.replaceWithText(built.api);
  applyFieldImports(opened.dataApiFile, built.apiSymbols);
  for (const importRef of imports) {
    applyImportRef(opened.dataApiFile, importRef);
  }
  return commit(transaction, undefined, built.warnings);
}

const TABLE_VIEW_ROUTES_IMPORT = "TableViewRoutes";

/**
 * Rewrite the route map of a resource's DataController. The map is the second
 * argument of its `extends` call, and the emitter already knows how to write
 * one, so patching is a matter of replacing that argument.
 */
export function configureResource(
  ref: string,
  patch: { routes?: ResourceRoute[] },
  opts?: MutationOpts,
): OpResult {
  const record = findResourceRecord(ref);
  if (!record) {
    return notFound(ref);
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound(ref);
  }
  const stale = checkVersion(
    ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  if (!patch.routes) {
    return { ok: true, data: undefined, changes: [] };
  }
  if (patch.routes.length === 0) {
    return invalidConfig("a resource must expose at least one route");
  }
  const readOnly = writeRoutesRefusal(record, patch.routes);
  if (readOnly) {
    return invalidConfig(readOnly);
  }
  const extendsCall = getExtendsCall(opened.dataApiClass);
  const routeMap = extendsCall?.getArguments()[1];
  if (!extendsCall || !routeMap) {
    return {
      ok: false,
      error: {
        code: "unsupported",
        detail: "the DataController call has no route map to patch",
      },
    };
  }
  const transaction = new Transaction(opened.project);
  transaction.track(opened.dataApiFile);
  routeMap.replaceWithText(routeMapExpr(patch.routes));
  ensureNamedImport(
    opened.dataApiFile,
    TABLE_VIEW_ROUTES_IMPORT,
    TABLE_VIEW_MODULE,
  );
  return commit(transaction, undefined);
}

export function removeField(fieldPath: string, opts?: MutationOpts): OpResult {
  const parsed = parseFieldPath(fieldPath);
  if (!parsed) {
    return notFound(fieldPath);
  }
  const record = findResourceRecord(parsed.ref);
  if (!record) {
    return notFound(fieldPath);
  }
  const opened = openResource(record);
  if (!opened) {
    return notFound(fieldPath);
  }
  const stale = checkVersion(
    parsed.ref,
    opened.databaseFile,
    opened.dataApiFile,
    opts,
  );
  if (stale) {
    return stale;
  }
  const dataApiProp = opened.dataApiClass.getProperty(parsed.field);
  const tableProp = opened.tableClass.getProperty(parsed.field);
  if (!dataApiProp && !tableProp) {
    return notFound(fieldPath);
  }
  const transaction = new Transaction(opened.project);
  transaction.track(opened.databaseFile);
  transaction.track(opened.dataApiFile);
  dataApiProp?.remove();
  tableProp?.remove();
  return commit(transaction, undefined);
}
