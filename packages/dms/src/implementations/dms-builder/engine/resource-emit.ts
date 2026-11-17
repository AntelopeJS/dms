import type {
  DataTypeValue,
  FieldSpec,
  ResourceRoute,
} from "@antelopejs/interface-dms-builder";
import { pascalCase, words } from "./emit";

export const CORE_SCHEMA_NAME_VALUE = "dms-core";
const CORE_SCHEMA_IDENTIFIER = "CORE_SCHEMA_NAME";

const API_MODULE = "@antelopejs/interface-api";
const DATA_API_MODULE = "@antelopejs/interface-data-api";
const METADATA_MODULE = "@antelopejs/interface-data-api/metadata";
const DB_MODULE = "@antelopejs/interface-database-decorators";
const DATATYPE_MODULE =
  "@antelopejs/interface-dms/base/data-types/default-types";
const SEARCHABLE_MODULE = "@antelopejs/interface-dms/base/searchable";
export const TABLE_VIEW_MODULE = "@antelopejs/interface-dms/base/table-view";
const CONSTANTS_MODULE = "@antelopejs/interface-dms/constants";
const GUARDS_MODULE = "@antelopejs/interface-dms/guards";
const AUTH_DB_MODULE = "@antelopejs/interface-dms/auth/db";
const TENANT_MODEL_MODULE = "@antelopejs/interface-dms/tenant-scoped-model";
const CONNECTION_ACCESS_MODULE = "@antelopejs/interface-dms/connection-access";
export const DATABASE_LOCAL = "./database";

export const RESOURCE_ROUTES: readonly ResourceRoute[] = [
  "list",
  "get",
  "create",
  "edit",
  "delete",
  "select",
  "archive",
  "export",
];

const EXPORT_ROUTES_SPREAD = "...TableViewRoutes.ExportRoutes";
const ALL_ROUTES_EXPR = "TableViewRoutes.All";

/**
 * The members of `TableViewRoutes` each route writes. Every key of
 * `TableViewRoutes.All` has to be named here or under `KEY_TO_ROUTE`: a key the
 * builder cannot name is dropped the first time it rewrites the map, and the
 * route it served is gone from the resource for good. `countBatch` and
 * `summary`, the tab counters and footer figures of a table, are served beside
 * the list, never alone.
 */
const ROUTE_MEMBERS: Record<ResourceRoute, [key: string, member: string][]> = {
  list: [
    ["list", "List"],
    ["count", "Count"],
    ["countBatch", "CountBatch"],
    ["summary", "Summary"],
  ],
  get: [["get", "Get"]],
  create: [["new", "New"]],
  edit: [["edit", "Edit"]],
  delete: [["delete", "Delete"]],
  select: [["select", "Select"]],
  archive: [
    ["archive", "Archive"],
    ["restore", "Restore"],
  ],
  export: [],
};

const KEY_TO_ROUTE = new Map<string, ResourceRoute>([
  ["list", "list"],
  ["count", "list"],
  ["countBatch", "list"],
  ["summary", "list"],
  ["get", "get"],
  ["new", "create"],
  ["edit", "edit"],
  ["delete", "delete"],
  ["select", "select"],
  ["archive", "archive"],
  ["restore", "archive"],
  /** Written as the `ExportRoutes` spread, but a map that names them one by one serves the same export. */
  ["exportStart", "export"],
  ["exportStatus", "export"],
  ["exportDownload", "export"],
]);

export function isResourceRoute(value: string): value is ResourceRoute {
  return RESOURCE_ROUTES.some((route) => route === value);
}

/**
 * The route map for a selection: `TableViewRoutes.All` for every route — so the
 * next route the DMS adds to `All` is served without the builder knowing its
 * name — and a literal naming each member otherwise.
 */
export function routeMapExpr(
  routes: readonly ResourceRoute[] | undefined,
): string {
  const selected = RESOURCE_ROUTES.filter(
    (route) => !routes || routes.includes(route),
  );
  if (selected.length === RESOURCE_ROUTES.length) {
    return ALL_ROUTES_EXPR;
  }
  const parts: string[] = [];
  for (const route of selected) {
    if (route === "export") {
      parts.push(EXPORT_ROUTES_SPREAD);
      continue;
    }
    for (const [key, member] of ROUTE_MEMBERS[route]) {
      parts.push(`${key}: TableViewRoutes.${member}`);
    }
  }
  return `{ ${parts.join(", ")} }`;
}

/**
 * Maps an emitted DataController route map back to the semantic `ResourceRoute`
 * set: `keys` are the object-literal property names, `hasExportRoutes` is whether
 * `...TableViewRoutes.ExportRoutes` was spread in. Returns `undefined` for the
 * full `TableViewRoutes.All` map (its keys round-trip to every route).
 */
export function routesFromRouteMap(
  keys: Iterable<string>,
  hasExportRoutes: boolean,
): ResourceRoute[] {
  const found = new Set<ResourceRoute>();
  for (const key of keys) {
    const route = KEY_TO_ROUTE.get(key);
    if (route) {
      found.add(route);
    }
  }
  if (hasExportRoutes) {
    found.add("export");
  }
  return RESOURCE_ROUTES.filter((route) => found.has(route));
}

/** The module each symbol a generated resource file names is imported from. */
export const DECORATOR_IMPORTS = {
  Controller: API_MODULE,
  DataController: DATA_API_MODULE,
  RegisterDataController: DATA_API_MODULE,
  Access: METADATA_MODULE,
  AccessMode: METADATA_MODULE,
  Listable: METADATA_MODULE,
  Mandatory: METADATA_MODULE,
  ModelReference: METADATA_MODULE,
  Optional: METADATA_MODULE,
  Sortable: METADATA_MODULE,
  Model: DB_MODULE,
  BasicDataModel: DB_MODULE,
  Field: DB_MODULE,
  Fixture: DB_MODULE,
  Index: DB_MODULE,
  RegisterTable: DB_MODULE,
  Table: DB_MODULE,
  Get: API_MODULE,
  Parameter: API_MODULE,
  TenantScopedModel: TENANT_MODEL_MODULE,
  AuthUserWithPermission: GUARDS_MODULE,
  User: AUTH_DB_MODULE,
  Searchable: SEARCHABLE_MODULE,
  ArchiveField: TABLE_VIEW_MODULE,
  Column: TABLE_VIEW_MODULE,
  Select: TABLE_VIEW_MODULE,
  Exported: TABLE_VIEW_MODULE,
  TableViewRoutes: TABLE_VIEW_MODULE,
  ExternalConnection: CONNECTION_ACCESS_MODULE,
  [CORE_SCHEMA_IDENTIFIER]: CONSTANTS_MODULE,
} as const;

/** A symbol a generated resource file may name. */
export type DecoratorSymbol = keyof typeof DECORATOR_IMPORTS;

export const DATA_API_MODULE_ORDER = [
  API_MODULE,
  DATA_API_MODULE,
  METADATA_MODULE,
  DB_MODULE,
  DATATYPE_MODULE,
  SEARCHABLE_MODULE,
  TABLE_VIEW_MODULE,
  CONNECTION_ACCESS_MODULE,
  DATABASE_LOCAL,
];

export const DATABASE_MODULE_ORDER = [DB_MODULE, CONSTANTS_MODULE];

export interface ResourceNames {
  className: string;
  modelName: string;
  apiName: string;
  tableName: string;
  route: string;
}

function camelCase(value: string): string {
  const pascal = pascalCase(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function pluralize(value: string): string {
  if (/(s|x|z|ch|sh)$/.test(value)) {
    return `${value}es`;
  }
  if (/[^aeiou]y$/.test(value)) {
    return `${value.slice(0, -1)}ies`;
  }
  return `${value}s`;
}

export function resourceClassName(name: string): string {
  return pascalCase(name);
}

function resourceModelName(name: string): string {
  return `${resourceClassName(name)}Model`;
}

function resourceApiName(name: string): string {
  return `${camelCase(name)}DataAPI`;
}

function resourceTableName(name: string): string {
  return pluralize(words(name).join("_"));
}

/** The ref a resource created under `name` is listed and bound by: its route without `/api/`. */
export function resourceRef(name: string): string {
  return words(name).join("-");
}

export function resourceRoute(name: string): string {
  return `/api/${resourceRef(name)}`;
}

export function resourceNames(name: string): ResourceNames {
  return {
    className: resourceClassName(name),
    modelName: resourceModelName(name),
    apiName: resourceApiName(name),
    tableName: resourceTableName(name),
    route: resourceRoute(name),
  };
}

export interface DbType {
  field: string;
  ts: string;
  fallback: boolean;
}

/** A column the database stores as it is, for a value that is not a scalar. */
const ANY_FIELD = "any";

/**
 * The column each built-in DataType is stored in, read off what the DataType
 * validates: a status is a checkbox and a time of day a number of seconds, so
 * neither is a string, whatever their names say. Only a DataType missing from
 * here — one a project registered itself — falls back to a string column.
 */
const DB_TYPE_MAP = new Map<string, { field: string; ts: string }>([
  ["string", { field: "string", ts: "string" }],
  ["email", { field: "string", ts: "string" }],
  ["url", { field: "string", ts: "string" }],
  ["password", { field: "string", ts: "string" }],
  ["color", { field: "string", ts: "string" }],
  ["phone", { field: "string", ts: "string" }],
  ["rich_text", { field: "string", ts: "string" }],
  ["select", { field: "string", ts: "string" }],
  ["number", { field: "number", ts: "number" }],
  ["price", { field: "number", ts: "number" }],
  ["percentage", { field: "number", ts: "number" }],
  ["string_time", { field: "number", ts: "number" }],
  ["date", { field: "date", ts: "Date" }],
  ["boolean", { field: "boolean", ts: "boolean" }],
  ["status", { field: "boolean", ts: "boolean" }],
  /** A relation holds the id of the row it points at. */
  ["relation", { field: "string", ts: "string" }],
  ["cascader_relation", { field: "string", ts: "string" }],
  ["tree", { field: "string", ts: "string" }],
  ["permissions", { field: ANY_FIELD, ts: "string[]" }],
  ["address", { field: ANY_FIELD, ts: "Record<string, string>" }],
  ["file", { field: ANY_FIELD, ts: "Record<string, unknown>" }],
  ["image", { field: ANY_FIELD, ts: "Record<string, unknown>" }],
]);

/** The DataTypes that hold a list of values once configured `multiple`. */
const MULTIPLE_TYPES = new Set([
  "relation",
  "cascader_relation",
  "tree",
  "file",
  "image",
]);

/** The DataTypes whose column holds the id of another row. */
const REFERENCE_TYPES = new Set(["relation", "cascader_relation", "tree"]);

/**
 * A field as the builder first writes it. A column holding another row's id is
 * indexed unless the caller says otherwise: the DMS joins and filters on it, and
 * without an index every such lookup scans the whole table. Only applied when a
 * field is created -- reconfiguring one never adds an index nobody asked for.
 */
export function withDefaultIndex(field: FieldSpec): FieldSpec {
  if (
    field.indexed !== undefined ||
    !REFERENCE_TYPES.has(field.dataType.$dataType)
  ) {
    return field;
  }
  return { ...field, indexed: true };
}

/** The column a DataType is stored in, as configured; `undefined` if unmapped. */
export function mappedDbType(
  dataType: DataTypeValue,
): { field: string; ts: string } | undefined {
  const known = DB_TYPE_MAP.get(dataType.$dataType);
  if (!known) {
    return undefined;
  }
  if (MULTIPLE_TYPES.has(dataType.$dataType) && dataType.config?.multiple) {
    return { field: ANY_FIELD, ts: `${known.ts}[]` };
  }
  return known;
}
