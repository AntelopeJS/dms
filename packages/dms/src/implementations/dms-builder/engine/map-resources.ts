import path from "node:path";
import type { RelationDescription } from "@antelopejs/interface-database-catalog";
import type {
  FileChange,
  MapResourcesInput,
  MapResourcesPreview,
  MapResourcesResult,
  MappedResult,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import type { Project, SourceFile } from "ts-morph";
import {
  generatedModelMethods,
  restoreModelMethods,
} from "./model-methods-keep";
import { catalogOf } from "./catalog-connection";
import { type DisplayDefaults, displayDefaultsOf } from "./display-defaults";
import { ensureNamedImport } from "./emit";
import { planMapping } from "./map-resources-batch";
import {
  type BatchTarget,
  type MappingPlan,
  type PlannedResource,
} from "./map-resources-plan";
import {
  declaredTargetsOutside,
  withDeclaredRelations,
} from "./map-resources-references";
import { MappingRefusal } from "./mapping-refusal";
import { pageOf } from "./mapped-displays";
import { markMapped } from "./mapped-modules";
import { targetModule } from "./modules";
import { changesModule, watchReloadOf } from "./module-reload";
import { commit, invalidConfig, unsupported } from "./ops";
import { addSortedExport, barrelSpecifier, srcDir } from "./placement";
import { buildDataApiFile, buildDatabaseFile } from "./resource-emit-types";
import {
  mappedRecordsOf,
  relationOf,
  type ResourceRecord,
  resourceRefResolver,
} from "./resource-index";
import {
  relabelPointingColumns,
  unlabelledTargetRefusal,
} from "./relabel-columns";
import { pagesToRemove, writePages } from "./map-resources-pages";
import { type EmitContext, UnknownReferenceError } from "./value";
import {
  getWritableProject,
  refreshFromDisk,
  resolveRootBarrel,
  Transaction,
} from "./writable";

const DECORATORS_MODULE = "@antelopejs/interface-database-decorators";
const REGISTER_SCHEMA = "RegisterSchema";
const START = "start";
const SELECT_DECORATOR = "Select";
const ID_FIELD = "_id";
const FULL_INDEX = `export * from "./database";\nexport * from "./data-api";\n`;

/** Resolves a resource ref to one of this batch's controllers, or to one the project has already. */
function batchResolver(plan: MappingPlan): EmitContext["resolveRef"] {
  const existing = resourceRefResolver();
  return (ref) => {
    const planned = plan.resources.find(
      (resource) => resource.ref === ref.resource,
    );
    if (!planned) {
      if (!existing) {
        throw new UnknownReferenceError(ref.resource);
      }
      return existing(ref);
    }
    const name = planned.names.apiName;
    return {
      text: name,
      import: { name, targetFile: path.join(planned.folder, "data-api.ts") },
    };
  };
}

interface ResourceFiles {
  database: string;
  dataApi: string;
  index: string;
}

/** Writes a file of the transaction: created, or rewritten when the relation was mapped before. */
function writeFile(
  project: Project,
  transaction: Transaction,
  filePath: string,
  text: string,
): void {
  const existing = project.getSourceFile(filePath);
  if (existing) {
    transaction.track(existing);
    existing.replaceWithText(text);
    return;
  }
  transaction.track(project.createSourceFile(filePath, text), true);
}

function writeResource(
  project: Project,
  transaction: Transaction,
  resource: PlannedResource,
  resolveRef: EmitContext["resolveRef"],
): ResourceFiles {
  const files: ResourceFiles = {
    database: path.join(resource.folder, "database.ts"),
    dataApi: path.join(resource.folder, "data-api.ts"),
    index: path.join(resource.folder, "index.ts"),
  };
  const database = buildDatabaseFile({
    names: resource.names,
    filePath: files.database,
    schema: resource.description.schema,
    fields: resource.tableFields,
    idField: resource.hasKey,
  });
  const previous = project.getSourceFile(files.database);
  const kept = previous
    ? generatedModelMethods(previous, resource.names.modelName)
    : [];
  writeFile(project, transaction, files.database, database.text);
  const written = project.getSourceFile(files.database);
  if (written && kept.length > 0) {
    restoreModelMethods(written, resource.names.modelName, kept);
  }
  const dataApi = buildDataApiFile({
    names: resource.names,
    filePath: files.dataApi,
    fields: resource.apiFields,
    routes: resource.routes,
    resolveRef,
  });
  writeFile(project, transaction, files.dataApi, dataApi.text);
  writeFile(project, transaction, files.index, FULL_INDEX);
  return files;
}

/** A relation mapped again is exported by the barrel already. */
function exportOnce(barrel: SourceFile, specifier: string): void {
  const exported = barrel
    .getExportDeclarations()
    .some((entry) => entry.getModuleSpecifierValue() === specifier);
  if (!exported) {
    addSortedExport(barrel, specifier);
  }
}

/** The module's `start` registers each mapped schema, which binds its table classes to it. */
function registerSchemas(barrel: SourceFile, schemas: string[]): void {
  ensureNamedImport(barrel, REGISTER_SCHEMA, DECORATORS_MODULE);
  const start =
    barrel.getFunction(START) ??
    barrel.addFunction({
      name: START,
      isExported: true,
      isAsync: true,
      returnType: "Promise<void>",
    });
  const body = start.getBodyText() ?? "";
  for (const schema of schemas) {
    const call = `await ${REGISTER_SCHEMA}(${JSON.stringify(schema)});`;
    if (!body.includes(call)) {
      start.addStatements(call);
    }
  }
}

interface WrittenResources {
  result: OpResult<MappedResult[]>;
}

function writeAll(
  input: MapResourcesInput,
  plan: MappingPlan,
): WrittenResources {
  const project = getWritableProject();
  const barrel = resolveRootBarrel(project, input.module);
  if (!barrel) {
    return {
      result: unsupported<MappedResult[]>(
        `module "${input.module}" has no src/index.ts`,
      ),
    };
  }
  const records = mappedRecordsOf(input.module);
  const unlabelled = unlabelledTargetRefusal(project, records, plan);
  if (unlabelled) {
    return { result: unsupported<MappedResult[]>(unlabelled) };
  }
  const transaction = new Transaction(project);
  transaction.track(barrel);
  const resolveRef = batchResolver(plan);
  const mapped = plan.resources.map((resource) => {
    const files = writeResource(project, transaction, resource, resolveRef);
    exportOnce(barrel, barrelSpecifier(barrel, resource.folder));
    return {
      relation: resource.relation,
      ref: resource.ref,
      files: Object.values(files).filter(
        (file): file is string => file !== undefined,
      ),
    };
  });
  relabelPointingColumns(project, transaction, records, plan);
  registerSchemas(barrel, [
    ...new Set(plan.resources.map((resource) => resource.description.schema)),
  ]);
  return { result: commit(transaction, mapped) };
}

function labelOf(record: ResourceRecord): string | undefined {
  return record.apiClass
    .getProperties()
    .find(
      (prop) =>
        prop.getName() !== ID_FIELD &&
        prop.getDecorator(SELECT_DECORATOR) !== undefined,
    )
    ?.getName();
}

/** A relation the module mapped before, as a target relation columns of this batch may point at. */
function mappedTarget(
  connection: string,
  record: ResourceRecord,
  description: RelationDescription,
): BatchTarget {
  return {
    resource: {
      relation: relationOf(record),
      label: labelOf(record),
      title: pageOf(connection, record)?.displayName,
      tableView: record.routes === undefined || record.routes.length > 0,
      writable: false,
      fields: [],
    },
    description,
    names: {
      className: record.className,
      modelName: record.modelName,
      apiName: record.apiName,
      tableName: record.tableName,
      route: record.route,
    },
    ref: record.ref,
  };
}

/** The relations columns of the batch refer to that the batch does not hold. */
function referencedOutside(input: MapResourcesInput): string[] {
  const batch = new Set(input.resources.map((resource) => resource.relation));
  return [
    ...new Set(
      input.resources.flatMap((resource) =>
        resource.fields
          .map((field) => field.relation)
          .filter(
            (relation): relation is string =>
              relation != null && !batch.has(relation),
          ),
      ),
    ),
  ];
}

function mappedTargets(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
): BatchTarget[] {
  const records = mappedRecordsOf(input.module);
  return referencedOutside(input).flatMap((relation) => {
    const record = records.get(relation);
    const description = descriptions.find(
      (candidate) => `${candidate.schema}.${candidate.name}` === relation,
    );
    return record && description
      ? [mappedTarget(input.connection, record, description)]
      : [];
  });
}

function planned(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  defaults: ReadonlyMap<string, DisplayDefaults>,
): MappingPlan | OpResult<MapResourcesResult> {
  const module = targetModule(input.module);
  if (!module || module.isProject) {
    return invalidConfig<MapResourcesResult>(
      `map into a local module bound to the database, not ${module ? "the project's own" : `unknown module "${input.module}"`}`,
    );
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const src = srcDir(project, input.module);
  if (!src) {
    return unsupported<MapResourcesResult>(
      `module "${input.module}" has no src/index.ts`,
    );
  }
  try {
    const chosen = withDeclaredRelations(input, descriptions);
    return planMapping(
      chosen,
      descriptions,
      src,
      mappedTargets(chosen, descriptions),
      defaults,
    );
  } catch (error) {
    if (error instanceof MappingRefusal) {
      return invalidConfig<MapResourcesResult>(error.message);
    }
    throw error;
  }
}

function recordMapping(input: MapResourcesInput, plan: MappingPlan): void {
  markMapped(input.module, {
    connection: input.connection,
    mapped: plan.resources.map((resource) => resource.relation),
    excluded: input.excluded ?? [],
  });
}

/** The pages this plan removes that `input.approvedPageRemovals` does not list; none when the field is left out. */
function unapprovedRemovals(
  input: MapResourcesInput,
  plan: MappingPlan,
): string[] {
  if (input.approvedPageRemovals === undefined) {
    return [];
  }
  const approved = new Set(input.approvedPageRemovals);
  return pagesToRemove(input, plan).filter((page) => !approved.has(page));
}

/**
 * Maps relations described by `descriptions` into a module bound to their database: the tables
 * and controllers in one typechecked transaction, then the connection's category and the
 * relations' TableView pages. A relation mapped before is rewritten, and its page follows.
 * A display or tabs the input leaves out take `defaults`; with none given, a display left out is written plain.
 */
export function mapDescribedResources(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  defaults: ReadonlyMap<string, DisplayDefaults> = new Map(),
): OpResult<MapResourcesResult> {
  const plan = planned(input, descriptions, defaults);
  if ("ok" in plan) {
    return plan;
  }
  if (plan.resources.length === 0 && plan.refused.length > 0) {
    return invalidConfig<MapResourcesResult>(plan.refused.join("; "));
  }
  if (plan.resources.length === 0) {
    recordMapping(input, plan);
    return { ok: true, data: { resources: [], leftOut: [] }, changes: [] };
  }
  const unapproved = unapprovedRemovals(input, plan);
  if (unapproved.length > 0) {
    return invalidConfig<MapResourcesResult>(
      `pages not approved for removal: ${unapproved.join(", ")}. The mapping would remove them now; nothing was written. Preview the mapping again and ask before removing them.`,
    );
  }
  const { result } = writeAll(input, plan);
  if (!result.ok) {
    return result;
  }
  recordMapping(input, plan);
  const pages = writePages(input, plan, result.data);
  const data = {
    resources: result.data,
    leftOut: plan.leftOut,
    category: pages.category,
  };
  const changes = [...result.changes, ...pages.changes].filter(changed);
  const warnings = [
    ...(result.warnings ?? []),
    ...plan.warnings,
    ...pages.warnings,
  ];
  return warnings.length > 0
    ? { ok: true, data, changes, warnings }
    : { ok: true, data, changes };
}

/** A file a remap rewrote to the text it had is not a change. */
function changed(change: FileChange): boolean {
  return change.kind !== "modify" || change.diff !== "";
}

/** The relations the call needs described: its own, and the mapped ones its columns point at. */
function describedRelations(input: MapResourcesInput): string[] {
  return [
    ...new Set([
      ...input.resources.map((resource) => resource.relation),
      ...referencedOutside(input),
    ]),
  ];
}

/**
 * Maps with {@link mapDescribedResources}, then, when the write changed a file of the target
 * module, waits for the runtime to reload that module and warns `module_not_loaded` if it did not
 * come back. The watch is set before the write so a quick reload is not missed.
 */
async function mapAndAwaitReload(
  input: MapResourcesInput,
  descriptions: RelationDescription[],
  defaults: ReadonlyMap<string, DisplayDefaults>,
): Promise<OpResult<MapResourcesResult>> {
  const reload = watchReloadOf(input.module);
  let result: OpResult<MapResourcesResult>;
  try {
    result = mapDescribedResources(input, descriptions, defaults);
  } catch (error) {
    reload.cancel();
    throw error;
  }
  const root = targetModule(input.module)?.root;
  if (!result.ok || !root || !changesModule(result.changes, root)) {
    reload.cancel();
    return result;
  }
  const warning = await reload.loaded();
  return warning
    ? { ...result, warnings: [...(result.warnings ?? []), warning] }
    : result;
}

/**
 * Reads the descriptions of the relations through the builder's catalog connection, and hands
 * them with the display defaults to `run`.
 */
async function withDescriptions<T>(
  input: MapResourcesInput,
  run: (
    descriptions: RelationDescription[],
    defaults: ReadonlyMap<string, DisplayDefaults>,
  ) => OpResult<T> | Promise<OpResult<T>>,
): Promise<OpResult<T>> {
  const catalog = catalogOf(input.connection);
  if (!catalog) {
    return invalidConfig<T>(
      `dms has no catalog connection "${input.connection}"; declare one in its importOverrides`,
    );
  }
  const relations = describedRelations(input);
  if (relations.length === 0) {
    return run([], new Map());
  }
  try {
    const own = await catalog.DescribeRelations(relations);
    const outside = declaredTargetsOutside(input, own);
    const descriptions =
      outside.length > 0
        ? [...own, ...(await catalog.DescribeRelations(outside))]
        : own;
    refreshFromDisk(getWritableProject());
    return await run(
      descriptions,
      await displayDefaultsOf(input, descriptions, catalog),
    );
  } catch (error) {
    return invalidConfig<T>(
      `the catalog of "${input.connection}" refused: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Maps with {@link mapAndAwaitReload}, once the relations are described. */
export function mapResources(
  input: MapResourcesInput,
): Promise<OpResult<MapResourcesResult>> {
  return withDescriptions(input, (descriptions, defaults) =>
    mapAndAwaitReload(input, descriptions, defaults),
  );
}

/** The pages {@link mapResources} would remove for `input`, planned the same way and written nowhere. */
export function previewMapResources(
  input: MapResourcesInput,
): Promise<OpResult<MapResourcesPreview>> {
  return withDescriptions(input, (descriptions, defaults) => {
    const plan = planned(input, descriptions, defaults);
    if ("ok" in plan) {
      return plan.ok ? { ...plan, data: { pagesToRemove: [] } } : plan;
    }
    if (plan.resources.length === 0 && plan.refused.length > 0) {
      return invalidConfig<MapResourcesPreview>(plan.refused.join("; "));
    }
    return {
      ok: true,
      data: { pagesToRemove: pagesToRemove(input, plan) },
      changes: [],
    };
  });
}
