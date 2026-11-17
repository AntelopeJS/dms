import fs from "node:fs";
import path from "node:path";
import type {
  CreateResourceInput,
  OpResult,
  OpWarning,
  ResourceFiles,
  ResourceLocation,
  ResourceRef,
} from "@antelopejs/interface-dms-builder";
import { type ClassDeclaration, type Project, type SourceFile } from "ts-morph";
import { isString } from "./scalar-guards";
import {
  barrelSpecifier,
  findNearestBarrel,
  resolveWithinSrc,
  srcDir,
} from "./placement";
import {
  CORE_SCHEMA_NAME_VALUE,
  isResourceRoute,
  resourceClassName,
  resourceNames,
  resourceRef,
  withDefaultIndex,
} from "./resource-emit";
import {
  buildDataApiFile,
  buildDatabaseFile,
  buildResourceIndex,
} from "./resource-emit-types";
import {
  findResourceRecord,
  type ResourceRecord,
  resourceRefResolver,
} from "./resource-index";
import { findCategoryRecord, findPageRecord } from "./source-index";
import {
  commit,
  duplicate,
  invalidConfig,
  invalidDataType,
  moduleError,
  unsupported,
} from "./ops";
import { UnknownDataTypeError, UnknownReferenceError } from "./value";
import { getWritableProject, refreshFromDisk, Transaction } from "./writable";
import { describeValue } from "./describe-value";
import { mappedConnectionOfFile } from "./mapped-modules";
import { moduleOfFile } from "./modules";
import { RESERVED_FIELD_NAMES } from "./reserved-names";

interface OpenResource {
  project: Project;
  databaseFile: SourceFile;
  dataApiFile: SourceFile;
  tableClass: ClassDeclaration;
  dataApiClass: ClassDeclaration;
}

export function openResource(record: ResourceRecord): OpenResource | undefined {
  const project = getWritableProject();
  refreshFromDisk(project);
  const databaseFile = project.getSourceFile(record.databaseFile);
  const dataApiFile = project.getSourceFile(record.dataApiFile);
  if (!databaseFile || !dataApiFile) {
    return undefined;
  }
  const tableClass = databaseFile.getClass(record.className);
  const dataApiClass = dataApiFile.getClass(record.apiName);
  if (!tableClass || !dataApiClass) {
    return undefined;
  }
  return { project, databaseFile, dataApiFile, tableClass, dataApiClass };
}

export function parseFieldPath(
  fieldPath: string,
): { ref: string; field: string } | undefined {
  const hash = fieldPath.indexOf("#");
  if (hash < 0) {
    return undefined;
  }
  const ref = fieldPath.slice(0, hash);
  const field = fieldPath.slice(hash + 1);
  if (!ref || !field) {
    return undefined;
  }
  return { ref, field };
}

type CreateData = { ref: ResourceRef; files: ResourceFiles };

interface ResolvedPlacement {
  folder: string;
  files: ResourceFiles;
  barrel: SourceFile;
  moduleSpecifier: string;
}

function resolveResourceBaseDir(
  src: string,
  location: ResourceLocation | undefined,
  module: string | undefined,
): string | OpResult<CreateData> {
  if (location === undefined) {
    return src;
  }
  if (isString(location)) {
    const resolved = resolveWithinSrc(src, location);
    return (
      resolved ??
      invalidConfig<CreateData>(
        `location "${location}" escapes the project src directory`,
      )
    );
  }
  if ("category" in location) {
    const category = findCategoryRecord(location.category);
    if (!category) {
      return invalidConfig<CreateData>(
        `unknown category "${location.category}"`,
      );
    }
    const misplaced = moduleError(
      module,
      category.importModule,
      `category "${location.category}"`,
    );
    if (misplaced) {
      return misplaced;
    }
    return category.importModule?.endsWith(".ts")
      ? path.dirname(category.importModule)
      : src;
  }
  const page = findPageRecord(location.page);
  if (!page) {
    return invalidConfig<CreateData>(`unknown page "${location.page}"`);
  }
  const misplaced = moduleError(
    module,
    page.filepath,
    `page "${location.page}"`,
  );
  if (misplaced) {
    return misplaced;
  }
  return path.dirname(page.filepath);
}

function resolveResourcePlacement(
  project: Project,
  input: CreateResourceInput,
): ResolvedPlacement | OpResult<CreateData> {
  const unknownModule = moduleError(input.module, undefined, "");
  if (unknownModule) {
    return unknownModule;
  }
  const src = srcDir(project, input.module);
  if (!src) {
    return unsupported<CreateData>("no root barrel (src/index.ts) found");
  }
  const baseDir = resolveResourceBaseDir(src, input.location, input.module);
  if (!isString(baseDir)) {
    return baseDir;
  }
  const mapped = mappedConnectionOfFile(baseDir);
  if (mapped) {
    return invalidConfig<CreateData>(
      `module "${moduleOfFile(baseDir)?.id}" mirrors the "${mapped}" database, where no table is created; map its relations with MapResources`,
    );
  }
  const barrel = findNearestBarrel(project, baseDir);
  if (!barrel) {
    return unsupported<CreateData>("no root barrel (src/index.ts) found");
  }
  const folder = path.join(baseDir, input.name);
  return {
    folder,
    files: {
      database: path.join(folder, "database.ts"),
      dataApi: path.join(folder, "data-api.ts"),
      index: path.join(folder, "index.ts"),
    },
    barrel,
    moduleSpecifier: barrelSpecifier(barrel, folder),
  };
}

/**
 * Create a resource: its database file, Data API file and index. The routes are
 * validated with `findIndex` rather than `find`: an `undefined` element is
 * itself an invalid route, and `find` cannot tell that from "every route is
 * valid", so `routes: [undefined]` would pass and emit a resource that
 * registers no endpoints at all.
 */
export function createResource(
  input: CreateResourceInput,
): OpResult<{ ref: ResourceRef; files: ResourceFiles }> {
  const className = resourceClassName(input.name);
  if (!input.name || !className) {
    return invalidConfig<{ ref: ResourceRef; files: ResourceFiles }>(
      "resource name must contain at least one alphanumeric character",
    );
  }
  const ref = resourceRef(input.name);
  if (findResourceRecord(ref)) {
    return duplicate<{ ref: ResourceRef; files: ResourceFiles }>(
      input.name,
      "resource",
    );
  }
  for (const field of input.fields) {
    const reserved = reservedFieldError(field.name);
    if (reserved) {
      return reserved;
    }
  }
  if (input.routes) {
    if (input.routes.length === 0) {
      return invalidConfig<{ ref: ResourceRef; files: ResourceFiles }>(
        "routes must list at least one route, or be omitted for all routes",
      );
    }
    const invalidIndex = input.routes.findIndex(
      (route) => !isResourceRoute(route),
    );
    if (invalidIndex !== -1) {
      return invalidConfig<{ ref: ResourceRef; files: ResourceFiles }>(
        `unknown route ${describeValue(input.routes[invalidIndex])}; valid routes: list, get, create, edit, delete, select, archive, export`,
      );
    }
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const placement = resolveResourcePlacement(project, input);
  if ("ok" in placement) {
    return placement;
  }
  const { folder, files, barrel, moduleSpecifier } = placement;
  if (fs.existsSync(folder)) {
    return duplicate<{ ref: ResourceRef; files: ResourceFiles }>(
      input.name,
      "resource",
    );
  }
  const names = resourceNames(input.name);
  const schema =
    input.schema && input.schema !== CORE_SCHEMA_NAME_VALUE
      ? input.schema
      : undefined;
  let databaseText: string;
  let dataApiText: string;
  let warnings: OpWarning[];
  const resolveRef = resourceRefResolver();
  const fields = input.fields.map(withDefaultIndex);
  try {
    const database = buildDatabaseFile({
      names,
      filePath: files.database,
      schema,
      fields,
      seeds: input.seeds,
      resolveRef,
    });
    const dataApi = buildDataApiFile({
      names,
      filePath: files.dataApi,
      fields,
      routes: input.routes,
      resolveRef,
    });
    databaseText = database.text;
    dataApiText = dataApi.text;
    warnings = [...database.warnings, ...dataApi.warnings];
  } catch (error) {
    if (error instanceof UnknownDataTypeError) {
      return invalidDataType<{ ref: ResourceRef; files: ResourceFiles }>(error);
    }
    if (error instanceof UnknownReferenceError) {
      return refError(error);
    }
    throw error;
  }
  const transaction = new Transaction(project);
  transaction.track(barrel);
  const databaseFile = project.createSourceFile(files.database, databaseText);
  transaction.track(databaseFile, true);
  const dataApiFile = project.createSourceFile(files.dataApi, dataApiText);
  transaction.track(dataApiFile, true);
  const indexFile = project.createSourceFile(files.index, buildResourceIndex());
  transaction.track(indexFile, true);
  barrel.addExportDeclaration({ moduleSpecifier });
  return commit(transaction, { ref, files }, warnings);
}

export function refError(error: UnknownReferenceError): OpResult<never> {
  return invalidConfig<never>(
    `${error.message}; call ListResources for valid resource refs`,
  );
}

export function reservedFieldError(name: string): OpResult<never> | undefined {
  if (RESERVED_FIELD_NAMES.has(name)) {
    return invalidConfig<never>(
      `field name "${name}" is reserved by the DataController (route or model property); choose another`,
    );
  }
  return undefined;
}
