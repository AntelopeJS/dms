import type {
  DataTypeValue,
  OpResult,
  ResourceFieldStructure,
  ResourceStructure,
} from "@antelopejs/interface-dms-builder";
import {
  type ClassDeclaration,
  Node,
  type ObjectLiteralExpression,
  type PropertyDeclaration,
  type SourceFile,
} from "ts-morph";
import { buildCatalog } from "./catalog";
import {
  getBooleanProperty,
  getNumberProperty,
  getObjectProperty,
  getStringProperty,
  stringLiteralValue,
} from "./literals";
import {
  isLiteralObject,
  type LiteralObject,
  type LiteralValue,
} from "./guards";
import { contentVersion } from "./page-structure";
import { findResourceBySymbol, findResourceRecord } from "./resource-index";

const KNOWN_DECORATORS = new Set([
  "Searchable",
  "Select",
  "Listable",
  "Column",
  "Sortable",
  "Optional",
  "Access",
  "Exported",
  "ArchiveField",
  "Mandatory",
]);

/**
 * The columns every resource carries, which the builder does not offer for
 * editing. They are left out of a resource's structure, so anything reasoning
 * about a named field has to know they exist all the same.
 */
export const RESERVED_FIELD_NAMES = new Set(["model", "_id"]);

class OpaqueFieldError extends Error {}

let ctorToId: Map<string, string> | undefined;

function dataTypeIdByCtor(ctorName: string): string | undefined {
  if (!ctorToId) {
    ctorToId = new Map();
    for (const descriptor of buildCatalog().dataTypes) {
      ctorToId.set(descriptor.import.name, descriptor.id);
    }
  }
  return ctorToId.get(ctorName);
}

function literalToValue(node: Node): LiteralValue {
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralValue();
  }
  if (Node.isNumericLiteral(node)) {
    return node.getLiteralValue();
  }
  if (Node.isTrueLiteral(node)) {
    return true;
  }
  if (Node.isFalseLiteral(node)) {
    return false;
  }
  if (Node.isNullLiteral(node)) {
    return null;
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().map((element) => literalToValue(element));
  }
  if (Node.isObjectLiteralExpression(node)) {
    const result: LiteralObject = {};
    for (const prop of node.getProperties()) {
      if (!Node.isPropertyAssignment(prop)) {
        throw new OpaqueFieldError("non-literal object member");
      }
      const initializer = prop.getInitializer();
      if (!initializer) {
        throw new OpaqueFieldError("missing initializer");
      }
      result[prop.getName().replace(/^["']|["']$/g, "")] =
        literalToValue(initializer);
    }
    return result;
  }
  if (Node.isIdentifier(node)) {
    const found = findResourceBySymbol(node.getText());
    if (found) {
      return found.as === "dataApi"
        ? { $ref: { resource: found.ref } }
        : { $ref: { resource: found.ref, as: found.as } };
    }
  }
  throw new OpaqueFieldError(`non-literal value "${node.getText()}"`);
}

/**
 * The same reading as {@link literalToValue}, but an expression it cannot read
 * as data is carried verbatim instead of making the whole field opaque. The
 * emitter writes a `$expr` back exactly as it stands, so nothing is lost and the
 * aspects the builder does model stay editable.
 */
function tolerantValue(node: Node): LiteralValue {
  try {
    return literalToValue(node);
  } catch (error) {
    if (!(error instanceof OpaqueFieldError)) {
      throw error;
    }
  }
  if (Node.isObjectLiteralExpression(node)) {
    const result: LiteralObject = {};
    for (const property of node.getProperties()) {
      if (!Node.isPropertyAssignment(property)) {
        throw new OpaqueFieldError("non-literal object member");
      }
      const initializer = property.getInitializer();
      if (!initializer) {
        throw new OpaqueFieldError("missing initializer");
      }
      result[property.getName().replace(/^["']|["']$/g, "")] =
        tolerantValue(initializer);
    }
    return result;
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().map((element) => tolerantValue(element));
  }
  return { $expr: node.getText() };
}

function reverseDataType(node: Node | undefined): DataTypeValue {
  if (!node || !Node.isNewExpression(node)) {
    throw new OpaqueFieldError("@Column type is not a DataType instance");
  }
  const id = dataTypeIdByCtor(node.getExpression().getText());
  if (!id) {
    throw new OpaqueFieldError(
      `unknown DataType constructor "${node.getExpression().getText()}"`,
    );
  }
  const args = node.getArguments();
  if (args.length > 1) {
    throw new OpaqueFieldError("@Column type takes more than one argument");
  }
  const configArg = args[0];
  if (!configArg) {
    return { $dataType: id };
  }
  const config = tolerantValue(configArg);
  if (isLiteralObject(config)) {
    return Object.keys(config).length > 0
      ? { $dataType: id, config }
      : { $dataType: id };
  }
  throw new OpaqueFieldError("@Column config is not an object literal");
}

function accessMode(prop: PropertyDeclaration): "read" | "readwrite" {
  const decorator = prop.getDecorator("Access");
  const arg = decorator?.getCallExpression()?.getArguments()[0];
  return arg?.getText().includes("ReadOnly") ? "read" : "readwrite";
}

const MODELLED_COLUMN_OPTIONS = new Set([
  "name",
  "type",
  "filterable",
  "order",
]);

/**
 * Everything in `@Column({...})` the builder has no aspect for. Kept verbatim so
 * a later write puts it back; a value it cannot read as data makes the field
 * opaque rather than silently losing it.
 */
function readColumnExtras(
  columnArg: ObjectLiteralExpression,
): LiteralObject | undefined {
  const extras: LiteralObject = {};
  for (const property of columnArg.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      throw new OpaqueFieldError("@Column holds a spread or a shorthand");
    }
    const key = property.getName().replace(/^["']|["']$/g, "");
    if (MODELLED_COLUMN_OPTIONS.has(key)) {
      continue;
    }
    const initializer = property.getInitializer();
    if (!initializer) {
      throw new OpaqueFieldError(`@Column option "${key}" has no value`);
    }
    try {
      extras[key] = literalToValue(initializer);
    } catch (error) {
      if (!(error instanceof OpaqueFieldError)) {
        throw error;
      }
      extras[key] = { $expr: initializer.getText() };
    }
  }
  return Object.keys(extras).length > 0 ? extras : undefined;
}

/**
 * Read one Data API field into the aspects the builder models.
 *
 * `@Listable`, `@Select` and `@Exported` are three separate scopes of the same
 * mechanism and are read independently, so a rewrite never adds a scope its
 * author did not write. A decorator or argument the builder does not model
 * (such as `@Exported(fields)`, a spread, or a second argument to the
 * `@Column` type's DataType constructor, `new X(config, extra)`) makes the
 * field opaque rather than losing it on the next write. Only the first
 * `@Column` argument is read. An expression that is not data is carried
 * verbatim as `$expr`.
 */
export function readDataApiFieldAspects(
  prop: PropertyDeclaration,
  indexedNames: Set<string>,
  declarations?: Map<
    string,
    { field: string; ts: string; optional: boolean; decorators: string[] }
  >,
): ResourceFieldStructure {
  const name = prop.getName();
  try {
    const unknown = prop
      .getDecorators()
      .map((decorator) => decorator.getName())
      .filter((decoratorName) => !KNOWN_DECORATORS.has(decoratorName));
    if (unknown.length > 0) {
      throw new OpaqueFieldError(`unsupported decorator @${unknown[0]}`);
    }
    const column = prop.getDecorator("Column");
    const columnArg = column?.getCallExpression()?.getArguments()[0];
    if (!column || !columnArg || !Node.isObjectLiteralExpression(columnArg)) {
      throw new OpaqueFieldError("field has no @Column({ type }) stack");
    }
    const dataType = reverseDataType(getObjectProperty(columnArg, "type"));
    const columnExtras = readColumnExtras(columnArg);
    const listable = prop.getDecorator("Listable") !== undefined;
    const selectable = prop.getDecorator("Select") !== undefined;
    const exported = prop.getDecorator("Exported");
    if (exported && exported.getArguments().length > 0) {
      throw new OpaqueFieldError("@Exported carries arguments");
    }
    const mandatory = prop.getDecorator("Mandatory");
    const mandatoryRoutes = mandatory?.getArguments().map((argument) => {
      const route = stringLiteralValue(argument);
      if (route === undefined) {
        throw new OpaqueFieldError("@Mandatory takes a non-literal route");
      }
      return route;
    });
    const result: ResourceFieldStructure = {
      name,
      dataType,
      label: getStringProperty(columnArg, "name") ?? name,
      listable,
      selectable,
      searchable: prop.getDecorator("Searchable") !== undefined,
      sortable: prop.getDecorator("Sortable") !== undefined,
      filterable: getBooleanProperty(columnArg, "filterable") ?? false,
      access: accessMode(prop),
      required: prop.getDecorator("Optional") === undefined,
      indexed: indexedNames.has(name),
      order: getNumberProperty(columnArg, "order"),
      exported: exported !== undefined,
      archiveField: prop.getDecorator("ArchiveField") !== undefined,
    };
    const dbField = declarations?.get(name);
    if (dbField) result.dbField = dbField;
    if (mandatoryRoutes?.length) result.mandatory = mandatoryRoutes;
    if (columnExtras) result.columnExtras = columnExtras;
    return result;
  } catch (error) {
    if (error instanceof OpaqueFieldError) {
      return { name, opaque: true, opaqueReason: error.message };
    }
    throw error;
  }
}

/**
 * The two decorators the builder writes itself; every other decorator on a
 * table property is its author's and travels through a rewrite untouched.
 */
const TABLE_DECORATORS = new Set(["Field", "Index"]);

/**
 * How each column is declared on the Table — the `@Field(...)` argument and the
 * TypeScript type, verbatim. Carried through a rewrite so a column the builder
 * did not create keeps the type its author chose.
 */
export function tableFieldDeclarations(
  tableClass: ClassDeclaration,
): Map<
  string,
  { field: string; ts: string; optional: boolean; decorators: string[] }
> {
  const declarations = new Map<
    string,
    { field: string; ts: string; optional: boolean; decorators: string[] }
  >();
  for (const prop of tableClass.getProperties()) {
    const argument = prop.getDecorator("Field")?.getArguments()[0];
    const type = prop.getTypeNode();
    if (argument && type) {
      declarations.set(prop.getName(), {
        field: argument.getText(),
        ts: type.getText(),
        optional: prop.hasQuestionToken(),
        decorators: prop
          .getDecorators()
          .filter((decorator) => !TABLE_DECORATORS.has(decorator.getName()))
          .map((decorator) => decorator.getText()),
      });
    }
  }
  return declarations;
}

export function indexedFieldNames(tableClass: ClassDeclaration): Set<string> {
  const names = new Set<string>();
  for (const prop of tableClass.getProperties()) {
    if (prop.getDecorator("Index")) {
      names.add(prop.getName());
    }
  }
  return names;
}

/** The version a resource's mutations check against: both of its files. */
export function resourceVersion(
  databaseFile: SourceFile,
  dataApiFile: SourceFile,
): string {
  return contentVersion(databaseFile.getFullText() + dataApiFile.getFullText());
}

export function buildResourceStructure(
  ref: string,
): OpResult<ResourceStructure> {
  const record = findResourceRecord(ref);
  if (!record) {
    return { ok: false, error: { code: "not_found", ref } };
  }
  const indexedNames = indexedFieldNames(record.tableClass);
  const declarations = tableFieldDeclarations(record.tableClass);
  const fields = record.apiClass
    .getProperties()
    .filter((prop) => !RESERVED_FIELD_NAMES.has(prop.getName()))
    .map((prop) => readDataApiFieldAspects(prop, indexedNames, declarations));
  const data: ResourceStructure = {
    ref: record.ref,
    className: record.className,
    tableName: record.tableName,
    route: record.route,
    schema: record.schema,
    files: {
      database: record.databaseFile,
      dataApi: record.dataApiFile,
      index: record.indexFile,
    },
    fields,
    version: resourceVersion(
      record.tableClass.getSourceFile(),
      record.apiClass.getSourceFile(),
    ),
  };
  if (record.routes) data.routes = record.routes;
  return { ok: true, data, changes: [] };
}
