import { InterfaceFunction } from "@antelopejs/interface-core";
import type { CategoryRef, PageRef } from "./addressing";
import type { MutationOpts, OpResult } from "./results";
import type { ConfigObject, DataTypeValue } from "./values";

/** A resource's stable ref — its `name`, e.g. `"product"`. */
export type ResourceRef = string;

/** A field's address within a resource: `<resourceRef>#<fieldName>`. */
export type FieldPath = string;

/** The paths of the files a resource is composed of. */
export interface ResourceFiles {
  database: string;
  dataApi: string;
  index: string;
}

/**
 * The semantic aspects of a resource field. The engine maps these to the paired
 * `@Field`/`@Index` (Table) and `@Select`/`@Listable`/`@Column`/`@Access`/…
 * (DataAPI) decorator stacks; the consumer never touches raw decorators.
 */
export interface FieldAspects {
  /** The field's DataType value, e.g. `{ $dataType: "string" }`. */
  dataType: DataTypeValue;
  /** Column header label; defaults to the field name. */
  label?: string;
  /** Listed by the DataAPI's list route (`@Listable`). Default true. */
  listable?: boolean;
  /** Offered to relation pickers by the select route (`@Select`). */
  selectable?: boolean;
  /** Full-text searchable. */
  searchable?: boolean;
  /** Sortable in the TableView. */
  sortable?: boolean;
  /** Column-filterable in the TableView. */
  filterable?: boolean;
  /** Field access mode. Default `"readwrite"`. */
  access?: "read" | "readwrite";
  /** Whether the field is required. Default false → `@Optional()`. */
  required?: boolean;
  /**
   * Whether the Table column is indexed. When a field is created, defaults to
   * true for `relation`, `cascader_relation` and `tree` fields and to false
   * otherwise.
   */
  indexed?: boolean;
  /** The `@Column` display order. */
  order?: number;
  /** Included in the resource's CSV export (`@Exported`). */
  exported?: boolean;
  /** The boolean column archiving marks (`@ArchiveField`). */
  archiveField?: boolean;
  /** Routes the field is mandatory on, e.g. `["new", "edit"]` (`@Mandatory`). */
  mandatory?: string[];
  /**
   * How the column is declared on the Table, as it stands: the `@Field(...)`
   * argument and the TypeScript type. Only a handful of DataTypes map to a
   * database type, so a field the builder did not write keeps its own
   * declaration instead of being narrowed to the `string` fallback.
   */
  dbField?: {
    field: string;
    ts: string;
    optional?: boolean;
    /**
     * The Table decorators the builder does not model — `@Localized()` and
     * anything else its author put there — carried verbatim. Dropping one
     * changes how the column is stored, so it is never re-derived.
     */
    decorators?: string[];
  };
  /**
   * The `@Column` options the builder does not model — `defaultValue`,
   * `description`, anything a hand-written field carries. They are read back
   * and written again untouched, so configuring a field never silently drops
   * what the builder did not put there.
   */
  columnExtras?: ConfigObject;
}

/** A field in a `CreateResource`/`AddField` request. */
export interface FieldSpec extends FieldAspects {
  /** Field name — immutable; rename = `RemoveField` + `AddField`. */
  name: string;
}

/**
 * A route a resource's DataAPI exposes. Selecting a subset lets a resource serve
 * only the endpoints it needs (e.g. a singleton edit form wants `["get", "edit"]`
 * and no list/create/delete). Each name maps to the paired `TableViewRoutes`
 * members the engine emits:
 *
 * - **`list`** — the paginated table listing (`list` + `count`).
 * - **`get`** — read a single row (detail / view).
 * - **`create`** — create a row (`new`).
 * - **`edit`** — update a row.
 * - **`delete`** — delete a row.
 * - **`select`** — option lists for relation pickers that reference this resource.
 * - **`archive`** — soft delete + undo (`archive` + `restore`).
 * - **`export`** — CSV/export endpoints (`exportStart`/`exportStatus`/`exportDownload`).
 */
export type ResourceRoute =
  | "list"
  | "get"
  | "create"
  | "edit"
  | "delete"
  | "select"
  | "archive"
  | "export";

/**
 * Where a resource's `<name>/` folder is placed, and which barrel re-exports it.
 * The nearest ancestor barrel to the resolved folder is wired (the root barrel is
 * the ultimate fallback), so a relative import chain to `src/index.ts` is kept.
 *
 * - **Omitted** — a `<name>/` folder at the src root (`src/<name>/`), as before.
 * - **A `dir` string** — an explicit folder relative to the src root; the resource
 *   lands at `src/<dir>/<name>/`. Must stay within the src tree.
 * - **`{ category }`** — the source folder of that category (mirrors page
 *   placement): `src/<category-dir>/<name>/`. A root category falls back to the
 *   src root.
 * - **`{ page }`** — nested inside that page's feature folder:
 *   `src/<page-dir>/<name>/`, so the page imports `./<name>/data-api`.
 */
export type ResourceLocation =
  | string
  | { category: CategoryRef }
  | { page: PageRef };

/**
 * Input for `CreateResource`. Creates a `<name>/` folder (see `location`) and
 * wires the nearest barrel.
 */
export interface CreateResourceInput {
  /** Unique resource name — duplicate → `duplicate_name`. */
  name: string;
  displayName?: string;
  /** DB schema; defaults to `CORE_SCHEMA_NAME`. */
  schema?: string;
  fields: FieldSpec[];
  /** `@Fixture` seed rows; each row must supply its own `_id`. */
  seeds?: ConfigObject[];
  /** File placement; omit for `src/<name>/`. */
  location?: ResourceLocation;
  /**
   * Which DataAPI routes to expose. Omit for the full set (list/get/create/edit/
   * delete/select/archive/export); pass a subset to serve only those endpoints —
   * an omitted route's HTTP endpoint is simply not registered. Must be non-empty
   * when provided.
   */
  routes?: ResourceRoute[];
  /**
   * The project module to write into, by its id in the project configuration. Unset, the
   * project's own module. A module is one of the project's local modules with an `src/index.ts`;
   * what it writes may only use declarations from that same module.
   */
  module?: string;
}

/**
 * A field as reported by `GetResourceStructure`. Aspects are present for
 * cleanly-reversed fields; an `opaque` field (hand-edited / unknown decorator /
 * relation) carries only `name` + `opaqueReason`.
 */
export interface ResourceFieldStructure extends Partial<FieldAspects> {
  name: string;
  /** True when the field's decorator stack could not be reversed. */
  opaque?: boolean;
  /** Set when `opaque === true`. */
  opaqueReason?: string;
}

/** A resource's full structure. `version` is a content hash of both files. */
export interface ResourceStructure {
  ref: ResourceRef;
  className: string;
  tableName: string;
  route: string;
  schema: string;
  files: ResourceFiles;
  fields: ResourceFieldStructure[];
  /**
   * The exposed DataAPI routes when the resource serves a subset; omitted when it
   * serves the full set (`TableViewRoutes.All`). Best-effort — absent for a
   * hand-edited route map the engine could not map back to semantic names.
   */
  routes?: ResourceRoute[];
  version: string;
}

/** A lightweight resource listing entry. */
export interface ResourceSummary {
  ref: ResourceRef;
  className: string;
  tableName: string;
  route: string;
  fieldCount: number;
  files: { database: string; dataApi: string };
  /** The project module the resource lives in, when it is not the project's own. */
  sourceModule?: string;
}

/** Options for `DeleteResource`. */
export interface DeleteResourceOpts extends MutationOpts {
  /**
   * Keep the resource's database table data. By default `DeleteResource` also
   * deletes every row of the resource's table (so a later resource reusing the
   * name/table re-seeds cleanly instead of inheriting stale documents); set
   * `true` to leave the data in place.
   */
  keepData?: boolean;
}

export const CreateResource =
  InterfaceFunction<
    (
      input: CreateResourceInput,
    ) => Promise<OpResult<{ ref: ResourceRef; files: ResourceFiles }>>
  >();
/** The resource fields `ConfigureResource` may patch. */
export interface EditableResourceMeta {
  /**
   * Which DataAPI routes the resource exposes. Replaces the current set, so
   * pass the whole list; omit the field to leave it alone.
   */
  routes?: ResourceRoute[];
}

/**
 * Patch a resource's DataAPI surface. Only what a route map can express is
 * patchable — a resource's fields are edited with `AddField`/`ConfigureField`.
 */
export const ConfigureResource =
  InterfaceFunction<
    (
      ref: ResourceRef,
      patch: EditableResourceMeta,
      opts?: MutationOpts,
    ) => Promise<OpResult>
  >();

/**
 * Delete a resource's files and, unless `keepData`, its table rows. Refused
 * with `referential_integrity` while another resource references it (a
 * relation field pointing at it); `blockedBy` lists those resources.
 */
export const DeleteResource =
  InterfaceFunction<
    (ref: ResourceRef, opts?: DeleteResourceOpts) => Promise<OpResult>
  >();
export const AddField =
  InterfaceFunction<
    (
      ref: ResourceRef,
      field: FieldSpec,
      opts?: MutationOpts,
    ) => Promise<OpResult<{ path: FieldPath }>>
  >();
export const ConfigureField =
  InterfaceFunction<
    (
      path: FieldPath,
      patch: Partial<FieldAspects>,
      opts?: MutationOpts,
    ) => Promise<OpResult>
  >();
export const RemoveField =
  InterfaceFunction<
    (path: FieldPath, opts?: MutationOpts) => Promise<OpResult>
  >();
export const ListResources =
  InterfaceFunction<() => Promise<ResourceSummary[]>>();
export const GetResourceStructure =
  InterfaceFunction<
    (ref: ResourceRef) => Promise<OpResult<ResourceStructure>>
  >();
