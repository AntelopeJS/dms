import path from "node:path";
import type {
  ResourceRoute,
  ResourceSummary,
} from "@antelopejs/interface-dms-builder";
import {
  type CallExpression,
  type ClassDeclaration,
  Node,
  type Project,
  type SourceFile,
} from "ts-morph";
import { getCalleeName, getExtendsCall, stringLiteralValue } from "./literals";
import {
  type IndexedProject,
  indexedProject,
  invalidateIndexedProject,
} from "./indexed-project";
import { moduleOfFile } from "./modules";
import {
  CORE_SCHEMA_NAME_VALUE,
  resourceRef,
  routesFromRouteMap,
} from "./resource-emit";
import { type EmitContext, UnknownReferenceError } from "./value";

export const CORE_SCHEMA_IDENTIFIER = "CORE_SCHEMA_NAME";
const API_ROUTE_PREFIX = "/api/";

export interface ResourceRecord {
  ref: string;
  className: string;
  modelName: string;
  apiName: string;
  tableName: string;
  route: string;
  schema: string;
  routes?: ResourceRoute[];
  databaseFile: string;
  dataApiFile: string;
  indexFile: string;
  apiClass: ClassDeclaration;
  tableClass: ClassDeclaration;
}

function resolveStringExpr(node: Node | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  const literal = stringLiteralValue(node);
  if (literal !== undefined) {
    return literal;
  }
  if (Node.isIdentifier(node)) {
    const decl = node.getDefinitionNodes()[0];
    if (decl && Node.isVariableDeclaration(decl)) {
      return stringLiteralValue(decl.getInitializer());
    }
  }
  return undefined;
}

function resolveSchema(node: Node | undefined): string {
  if (!node) {
    return CORE_SCHEMA_NAME_VALUE;
  }
  if (Node.isIdentifier(node) && node.getText() === CORE_SCHEMA_IDENTIFIER) {
    return CORE_SCHEMA_NAME_VALUE;
  }
  return resolveStringExpr(node) ?? node.getText();
}

function findControllerCall(call: CallExpression): CallExpression | undefined {
  for (const arg of call.getArguments()) {
    if (Node.isCallExpression(arg) && getCalleeName(arg) === "Controller") {
      return arg;
    }
  }
  return undefined;
}

function resolveRoutes(node: Node | undefined): ResourceRoute[] | undefined {
  if (!node) {
    return undefined;
  }
  if (Node.isPropertyAccessExpression(node)) {
    return undefined;
  }
  if (Node.isIdentifier(node)) {
    const decl = node.getDefinitionNodes()[0];
    if (decl && Node.isVariableDeclaration(decl)) {
      return resolveRoutes(decl.getInitializer());
    }
    return undefined;
  }
  if (!Node.isObjectLiteralExpression(node)) {
    return undefined;
  }
  const keys: string[] = [];
  let hasExportRoutes = false;
  for (const property of node.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      if (property.getExpression().getText().includes("ExportRoutes")) {
        hasExportRoutes = true;
      }
      continue;
    }
    if (
      Node.isPropertyAssignment(property) ||
      Node.isShorthandPropertyAssignment(property)
    ) {
      keys.push(property.getName());
    }
  }
  const routes = routesFromRouteMap(keys, hasExportRoutes);
  return routes.length > 0 || node.getProperties().length === 0
    ? routes
    : undefined;
}

function resolveTableClass(
  node: Node | undefined,
): ClassDeclaration | undefined {
  if (!node || !Node.isIdentifier(node)) {
    return undefined;
  }
  for (const decl of node.getDefinitionNodes()) {
    if (Node.isClassDeclaration(decl)) {
      return decl;
    }
  }
  return undefined;
}

function findModelClass(
  databaseFile: SourceFile,
  tableName: string,
): ClassDeclaration | undefined {
  for (const cls of databaseFile.getClasses()) {
    const call = getExtendsCall(cls);
    if (!call || getCalleeName(call) !== "BasicDataModel") {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg && Node.isIdentifier(arg) && arg.getText() === tableName) {
      return cls;
    }
  }
  return undefined;
}

class ResourceScanner {
  private readonly records = new Map<string, ResourceRecord>();

  constructor(private readonly project: Project) {}

  public scan(): Map<string, ResourceRecord> {
    const sourceFiles = this.project
      .getSourceFiles()
      .filter((sf) => !sf.isInNodeModules());
    for (const sourceFile of sourceFiles) {
      for (const cls of sourceFile.getClasses()) {
        this.scanClass(cls);
      }
    }
    return this.records;
  }

  private scanClass(cls: ClassDeclaration): void {
    if (!cls.getDecorator("RegisterDataController")) {
      return;
    }
    const extendsCall = getExtendsCall(cls);
    if (!extendsCall || getCalleeName(extendsCall) !== "DataController") {
      return;
    }
    const apiName = cls.getName();
    if (!apiName) {
      return;
    }
    const controllerCall = findControllerCall(extendsCall);
    const route = stringLiteralValue(controllerCall?.getArguments()[0]);
    if (!route) {
      return;
    }
    const tableClass = resolveTableClass(extendsCall.getArguments()[0]);
    const tableName = tableClass?.getName();
    if (!tableClass || !tableName) {
      return;
    }
    const routes = resolveRoutes(extendsCall.getArguments()[1]);
    const registerTable = tableClass.getDecorator("RegisterTable");
    const registerArgs = registerTable?.getCallExpression()?.getArguments();
    const dbTableName =
      resolveStringExpr(registerArgs?.[0]) ?? tableName.toLowerCase();
    const schema = resolveSchema(registerArgs?.[1]);
    const databaseFile = tableClass.getSourceFile();
    const modelClass = findModelClass(databaseFile, tableName);
    const ref = route.startsWith(API_ROUTE_PREFIX)
      ? route.slice(API_ROUTE_PREFIX.length)
      : route;
    const databaseFilePath = databaseFile.getFilePath();
    this.records.set(ref, {
      ref,
      className: tableName,
      modelName: modelClass?.getName() ?? `${tableName}Model`,
      apiName,
      tableName: dbTableName,
      route,
      schema,
      routes,
      databaseFile: databaseFilePath,
      dataApiFile: cls.getSourceFile().getFilePath(),
      indexFile: path.join(path.dirname(databaseFilePath), "index.ts"),
      apiClass: cls,
      tableClass,
    });
  }
}

let cached:
  | { indexed: IndexedProject; records: Map<string, ResourceRecord> }
  | undefined;

/**
 * The app's resources, as its files are right now. Rescanned when one of them
 * has been written by someone other than the engine, for the reason the page
 * scan is — see `getSourceIndex`.
 */
function getResourceIndex(): Map<string, ResourceRecord> {
  const indexed = indexedProject();
  if (cached?.indexed !== indexed) {
    cached = { indexed, records: new ResourceScanner(indexed.project).scan() };
  }
  return cached.records;
}

export function invalidateResourceIndex(): void {
  cached = undefined;
  invalidateIndexedProject();
}

/**
 * The resource listed under `ref`, or else the one `CreateResource` made from `ref` as a name.
 * Two names with one ref are refused at creation, so a name finds at most one resource.
 */
export function findResourceRecord(ref: string): ResourceRecord | undefined {
  const index = getResourceIndex();
  return index.get(ref) ?? index.get(resourceRef(ref));
}

export function listResourceRecords(): ResourceRecord[] {
  return Array.from(getResourceIndex().values());
}

/** `"schema.name"` of the relation a resource maps. */
export function relationOf(record: ResourceRecord): string {
  return `${record.schema}.${record.tableName}`;
}

/** The resources a module has mapped, by relation. */
export function mappedRecordsOf(module: string): Map<string, ResourceRecord> {
  return new Map(
    listResourceRecords()
      .filter((record) => moduleOfFile(record.databaseFile)?.id === module)
      .map((record) => [relationOf(record), record]),
  );
}

export function resourceRefResolver(): EmitContext["resolveRef"] {
  return ({ resource, as = "dataApi" }) => {
    const record = findResourceRecord(resource);
    if (!record) {
      throw new UnknownReferenceError(resource);
    }
    const name =
      as === "table"
        ? record.className
        : as === "model"
          ? record.modelName
          : record.apiName;
    const targetFile =
      as === "dataApi" ? record.dataApiFile : record.databaseFile;
    return { text: name, import: { name, targetFile } };
  };
}

export function findResourceBySymbol(
  name: string,
): { ref: string; as: "dataApi" | "table" | "model" } | undefined {
  for (const record of getResourceIndex().values()) {
    if (record.apiName === name) {
      return { ref: record.ref, as: "dataApi" };
    }
    if (record.className === name) {
      return { ref: record.ref, as: "table" };
    }
    if (record.modelName === name) {
      return { ref: record.ref, as: "model" };
    }
  }
  return undefined;
}

export function listResourceSummaries(): ResourceSummary[] {
  return listResourceRecords().map((record) => {
    const summary: ResourceSummary = {
      ref: record.ref,
      className: record.className,
      tableName: record.tableName,
      route: record.route,
      fieldCount: record.apiClass
        .getProperties()
        .filter((prop) => prop.getName() !== "model").length,
      files: { database: record.databaseFile, dataApi: record.dataApiFile },
    };
    const source = moduleOfFile(record.databaseFile);
    if (source && !source.isProject) {
      summary.sourceModule = source.id;
    }
    return summary;
  });
}
