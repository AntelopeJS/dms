import path from "node:path";
import {
  type ControllerClass,
  ControllerMeta,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import type { Class } from "@antelopejs/interface-core/decorators";
import type { ComponentBuilder } from "@antelopejs/interface-dms/component";
import type { DataType } from "@antelopejs/interface-dms/base/data-types";
import type * as TableViewApi from "@antelopejs/interface-dms/base/table-view";
import type {
  BlockDraft,
  BlockPath,
  ComponentPreview,
  ConfigObject,
  ConfigSchema,
  ConfigValue,
  OpResult,
  OptionSchema,
  PageDraft,
  PageLayoutPreview,
} from "@antelopejs/interface-dms-builder";
import { blockDescriptor, buildCatalog } from "./catalog";
import { notFound } from "./ops";
import { resolveProjectRoot } from "./project";
import { findResourceRecord } from "./resource-index";
import { findPageRecord } from "./source-index";
import { isCallable, isIndexable, isLiteralObject } from "./guards";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./value";

const BASE_MODULE = "@antelopejs/interface-dms/base";
const TABLE_VIEW_MODULE = `${BASE_MODULE}/table-view`;
const PLACEHOLDER_TYPE = "Placeholder";
const PLACEHOLDER_HEIGHT = "96px";
const TABLE_VIEW_TYPE = "TableView";

/**
 * The blocks over a table whose factory only reads the controller, so building
 * one for the preview leaves the running app as it found it. A TableView is not
 * one: it writes its options, guards and gate flag onto the controller's own
 * metadata, which every page mounting that table shares — it previews as a
 * read-only table over the same rows instead (`tablePreview`).
 */
const READ_ONLY_CONTROLLER_BLOCKS = new Set(["ResourceForm"]);

/**
 * The options of a Table block a read-only table over its rows shows as the
 * page will: its title, its look, its search, sort, tabs and filters. Its
 * actions and forms are the page's alone.
 */
const TABLE_PREVIEW_OPTIONS = [
  "caption",
  "layout",
  "density",
  "maxHeight",
  "pageSize",
  "searchPlaceholder",
  "labelKey",
  "defaultSort",
  "emptyStates",
  "tabs",
  "quickFilters",
  "card",
  "rowIdKey",
];

/** What a column of a source table takes of a `@Column`'s options. */
const SOURCE_COLUMN_OPTIONS = [
  "name",
  "description",
  "type",
  "order",
  "isVisible",
  "filterable",
  "cellWrap",
  "size",
  "display",
] as const satisfies readonly (keyof TableViewApi.ColumnOptions)[];

/** What a data controller's list route handles itself: all of it. */
const LIST_ROUTE_CAPABILITIES = {
  search: true,
  sort: true,
  paginate: true,
  filter: true,
};

/** The options of a block as the draft holds them, by option name. */
type BlockOptions = ConfigObject;

/** A config value once its sentinels are resolved: data, DataType instances, DataAPI classes and nested builders. */
type RuntimeValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | RuntimeValue[]
  | RuntimeObject
  | DataType
  | ControllerClass
  | PreviewBuilder;

/** An options object whose values are {@link RuntimeValue}s. */
interface RuntimeObject {
  [key: string]: RuntimeValue;
}

/** A config object whose `$dataType` names a DataType. */
type DataTypeSentinel = ConfigObject & { $dataType: string };

/** What the preview reads of a table's metadata, never writes. */
type TableMetadata = Pick<TableViewApi.TableViewMeta, "columns" | "config">;

/** The part of the table view module the preview drives. */
interface TableViewModule {
  TableViewMeta: typeof TableViewApi.TableViewMeta;
  tableViewFromSource: (
    options: Omit<TableViewApi.TableViewSourceOptions, "columns"> & {
      columns: Record<string, Partial<TableViewApi.TableViewSourceColumn>>;
    },
  ) => PreviewBuilder;
}

function isTableViewModule(value: unknown): value is TableViewModule {
  return (
    isIndexable(value) &&
    typeof value.TableViewMeta === "function" &&
    typeof value.tableViewFromSource === "function"
  );
}

function tableViewModule(): TableViewModule {
  const loaded: unknown = require(TABLE_VIEW_MODULE);
  if (!isTableViewModule(loaded)) {
    throw new DegradedBlockError(
      `${TABLE_VIEW_MODULE} does not export the table view functions`,
    );
  }
  return loaded;
}

/** What a builder takes of a child besides its component: its slot and the rest of its metadata. */
type ChildMeta = Parameters<ComponentBuilder["child"]>[2];

/** The subset of `ComponentBuilder` the preview drives. */
interface PreviewBuilder {
  child(id: string, component: PreviewBuilder, meta?: ChildMeta): this;
  serialize(): Promise<ComponentPreview>;
}

type BlockFactory = (...args: unknown[]) => PreviewBuilder;

class DegradedBlockError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

/** What `value` spreads from: itself when an object or a function, else nothing. */
function spreadable(value: RuntimeValue): object | undefined {
  return isCallable(value) || isPlainObject(value) ? value : undefined;
}

function isDataTypeSentinel(value: ConfigObject): value is DataTypeSentinel {
  return isString(value.$dataType);
}

/** Whether an export of `BASE_MODULE` is a block factory: the module exports one function per block type, and a function is all that can be checked of it. */
function isBlockFactory(value: unknown): value is BlockFactory {
  return typeof value === "function";
}

function factoryFor(type: string): BlockFactory {
  const factory: unknown = require(BASE_MODULE)[type];
  if (!isBlockFactory(factory)) {
    throw new DegradedBlockError(`no runtime factory for block type "${type}"`);
  }
  return factory;
}

/** Whether an export is a DataAPI controller class, which a metadata read then confirms by its route. */
function isControllerClass(value: unknown): value is ControllerClass {
  return typeof value === "function";
}

/** Whether an export is a DataType class: the catalog entry names a class export such as `DefaultDataTypes.StringType`. */
function isDataTypeClass(value: unknown): value is Class<DataType> {
  return typeof value === "function";
}

/**
 * A resource's DataAPI class as the running app loaded it, or `undefined`.
 *
 * Read off the require cache, never required: loading the file from here would
 * run its decorators a second time. The core drops a module's files from that
 * cache when it reloads the module, so what is found is the live class — and a
 * table created a moment ago, which the app has not reloaded under yet, is
 * simply not there.
 */
function loadedController(
  ref: string | undefined,
): ControllerClass | undefined {
  const record = ref ? findResourceRecord(ref) : undefined;
  if (!record) {
    return undefined;
  }
  const root = `${resolveProjectRoot()}${path.sep}`;
  const dependencies = `${path.sep}node_modules${path.sep}`;
  for (const [file, entry] of Object.entries(require.cache)) {
    if (!file.startsWith(root) || file.includes(dependencies)) {
      continue;
    }
    const exported: unknown = entry?.exports?.[record.apiName];
    if (!isControllerClass(exported)) {
      continue;
    }
    if (GetMetadata(exported, ControllerMeta).location === record.route) {
      return exported;
    }
  }
  return undefined;
}

/**
 * A DataType instance for a `$dataType` config value, built from the export its
 * catalog entry names: a dotted path such as `DefaultDataTypes.StringType`.
 */
function instantiateDataType(value: DataTypeSentinel): DataType {
  const id = value.$dataType;
  const descriptor = buildCatalog().dataTypes.find((type) => type.id === id);
  if (!descriptor?.import.module) {
    throw new DegradedBlockError(`unknown dataType "${id}"`);
  }
  const exported = descriptor.import.name
    .split(".")
    .reduce<unknown>(
      (current, part) => (isPlainObject(current) ? current[part] : undefined),
      require(descriptor.import.module),
    );
  if (!isDataTypeClass(exported)) {
    throw new DegradedBlockError(`dataType "${id}" is not constructible`);
  }
  return new exported(
    value.config === undefined ? undefined : materialize(value.config),
  );
}

/**
 * The DataAPI class a `$ref` in a config names — the table a relation field
 * points at — as the running app loaded it.
 *
 * Only read, as a table form's own class is: the DataType looks the table's
 * routes up on it, which is what the saved page would do when served.
 */
function referencedController(ref: {
  as?: unknown;
  resource?: unknown;
}): ControllerClass {
  const dataApi = ref.as === undefined || ref.as === "dataApi";
  const controller =
    dataApi && isString(ref.resource)
      ? loadedController(ref.resource)
      : undefined;
  if (!controller) {
    throw new DegradedBlockError("a table it reads needs the running page");
  }
  return controller;
}

/** Resolves the sentinels a config may carry into the values a factory expects. */
function materialize(value: ConfigValue): RuntimeValue {
  if (Array.isArray(value)) {
    return value.map(materialize);
  }
  if (!isLiteralObject(value)) {
    return value;
  }
  if (isString(value.$expr)) {
    throw new DegradedBlockError("$expr cannot be previewed");
  }
  if (isLiteralObject(value.$ref)) {
    return referencedController(value.$ref);
  }
  if (isDataTypeSentinel(value)) {
    return instantiateDataType(value);
  }
  if (isLiteralObject(value.$block)) {
    const { type, config } = value.$block;
    return buildBlock({
      name: "preview",
      type: isString(type) ? type : undefined,
      config: isLiteralObject(config) ? config : {},
    });
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, materialize(entry)]),
  );
}

/** A value still missing an option its schema requires. */
const UNFINISHED = Symbol("unfinished");

function isEmpty(value: ConfigValue): value is "" | null | undefined {
  return value === undefined || value === null || value === "";
}

function isFinished(
  value: ConfigValue | typeof UNFINISHED,
): value is ConfigValue {
  return value !== UNFINISHED;
}

function isRequired(schema: OptionSchema): boolean {
  return !schema.optional && schema.default === undefined;
}

/**
 * `value` without the list entries it holds that are still being filled in, or
 * `UNFINISHED` when `value` is one of them: a required option left empty,
 * however deep. Hidden options are not the author's to fill, so they are not
 * counted — the same reading the panel's "Waiting on" makes.
 */
function finished(
  schema: OptionSchema,
  value: ConfigValue,
): ConfigValue | typeof UNFINISHED {
  if (isEmpty(value)) {
    return isRequired(schema) ? UNFINISHED : value;
  }
  if (schema.oneOf?.length) {
    for (const branch of schema.oneOf) {
      const kept = finished(branch, value);
      if (kept !== UNFINISHED) {
        return kept;
      }
    }
    return UNFINISHED;
  }
  if (schema.properties && isLiteralObject(value)) {
    const kept: ConfigObject = { ...value };
    for (const [key, nested] of Object.entries(schema.properties)) {
      if (nested.ui?.hidden) {
        continue;
      }
      const entry = finished(nested, value[key]);
      if (entry === UNFINISHED) {
        return UNFINISHED;
      }
      if (key in value) {
        kept[key] = entry;
      }
    }
    return kept;
  }
  if (schema.items && Array.isArray(value)) {
    const items = schema.items;
    return value.map((entry) => finished(items, entry)).filter(isFinished);
  }
  if (schema.values && isLiteralObject(value)) {
    const values = schema.values;
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        const settled = finished(values, entry);
        return isFinished(settled) ? [[key, settled] as const] : [];
      }),
    );
  }
  return value;
}

/**
 * A block's options as the preview builds it: the list entries the author has
 * only begun left out.
 *
 * A form's field arrives with a label and nothing else, and the factory reads
 * its type the moment it is called — so one field just added took the whole
 * form down to a placeholder, until a type was chosen. The block previews as it
 * stood before the entry, and the entry joins it once it is filled in. An
 * option of the block itself left empty is kept as it is: that is the block
 * being unfinished, and the placeholder is the right answer to it.
 */
function withoutUnfinishedEntries(
  schema: ConfigSchema,
  config: BlockOptions,
): BlockOptions {
  const kept: BlockOptions = { ...config };
  for (const [key, option] of Object.entries(schema)) {
    if (!(key in config)) {
      continue;
    }
    const entry = finished(option, config[key]);
    if (entry !== UNFINISHED) {
      kept[key] = entry;
    }
  }
  return kept;
}

/** What the preview walks: the paths it had to stand in for. */
interface PreviewContext {
  degraded: BlockPath[];
  pageRef: string;
}

/**
 * A block the preview cannot build faithfully still has to occupy its place, or
 * its siblings would vanish with it. It renders as a labelled placeholder and
 * the caller is told which paths were substituted.
 */
function placeholderFor(reason: string): PreviewBuilder {
  return factoryFor(PLACEHOLDER_TYPE)({
    label: reason,
    height: PLACEHOLDER_HEIGHT,
  });
}

function childMeta(block: BlockDraft): ChildMeta {
  const slot = block.slot === undefined ? {} : { slot: block.slot };
  const combined = { ...slot, ...block.meta };
  return Object.keys(combined).length > 0 ? combined : undefined;
}

function buildBlock(block: BlockDraft): PreviewBuilder {
  if (block.preserve || block.lockedOptions) {
    throw new DegradedBlockError("written by hand — kept as it stands");
  }
  const descriptor = block.type ? blockDescriptor(block.type) : undefined;
  if (!descriptor) {
    throw new DegradedBlockError(`unknown block type "${block.type}"`);
  }
  const label = descriptor.label ?? descriptor.type;
  if (descriptor.controllerArg && !block.controller) {
    throw new DegradedBlockError(`${label} — choose its table`);
  }
  const previewed =
    READ_ONLY_CONTROLLER_BLOCKS.has(descriptor.type) ||
    descriptor.type === TABLE_VIEW_TYPE;
  const controller =
    descriptor.controllerArg && previewed
      ? loadedController(block.controller)
      : undefined;
  if (descriptor.controllerArg && !controller) {
    throw new DegradedBlockError(`${label} — needs the running page`);
  }
  const config = materialize(
    withoutUnfinishedEntries(descriptor.config, block.config ?? {}),
  );
  const spread = spreadable(config);
  if (!spread) {
    throw new DegradedBlockError("its options cannot be previewed");
  }
  const options: RuntimeObject = { ...descriptor.defaults, ...spread };
  if (descriptor.type === TABLE_VIEW_TYPE) {
    if (!controller) {
      throw new DegradedBlockError(`${label} — needs the running page`);
    }
    return tablePreview(controller, options);
  }
  return controller
    ? factoryFor(descriptor.type)(controller, options)
    : factoryFor(descriptor.type)(options);
}

function picked<Source extends object, Key extends keyof Source>(
  source: Source | undefined,
  keys: readonly Key[],
): Partial<Pick<Source, Key>> {
  const kept: Partial<Pick<Source, Key>> = {};
  for (const key of keys) {
    const entry = source?.[key];
    if (entry !== undefined) {
      kept[key] = entry;
    }
  }
  return kept;
}

/** The columns the table lists, as a source table takes them. */
function listedColumns(meta: TableMetadata) {
  return Object.fromEntries(
    meta.config.columns
      .filter((column) => column.listable)
      .map((column) => [
        column.id,
        {
          ...picked(meta.columns[column.id], SOURCE_COLUMN_OPTIONS),
          sortable: column.enableSorting,
        },
      ]),
  );
}

/**
 * A Table block as the canvas shows it: the table's columns and rows, read
 * through its own list route by a read-only table over that route.
 *
 * The block itself is not built: `TableView()` writes its options, guards and
 * forms onto the table's metadata, which every page mounting that table shares.
 * Its actions are what the saved page adds; the rows are the ones it will list.
 */
function tablePreview(
  controller: ControllerClass,
  options: RuntimeObject,
): PreviewBuilder {
  const module = tableViewModule();
  const meta = GetMetadata(controller, module.TableViewMeta);
  return module.tableViewFromSource({
    ...picked(options, TABLE_PREVIEW_OPTIONS),
    columns: listedColumns(meta),
    fetchUrl: `${meta.config.location}/list`,
    capabilities: LIST_ROUTE_CAPABILITIES,
  });
}

function instantiateBlock(
  block: BlockDraft,
  path: string,
  context: PreviewContext,
): PreviewBuilder {
  let builder: PreviewBuilder;
  try {
    builder = buildBlock(block);
  } catch (error) {
    context.degraded.push(path);
    const reason =
      error instanceof DegradedBlockError
        ? error.reason
        : "cannot be previewed";
    return placeholderFor(reason);
  }
  for (const child of block.children ?? []) {
    const instance = instantiateBlock(child, `${path}/${child.name}`, context);
    builder.child(child.name, instance, childMeta(child));
  }
  return builder;
}

/**
 * Preview a page draft's layout. The page is looked up in the source index, not
 * on disk, because the preview runs on every edit.
 */
export async function previewLayout(
  ref: string,
  draft: PageDraft,
): Promise<OpResult<PageLayoutPreview>> {
  if (!findPageRecord(ref)) {
    return notFound<PageLayoutPreview>(ref);
  }
  const components: Record<string, ComponentPreview> = {};
  const context: PreviewContext = { degraded: [], pageRef: ref };
  for (const block of draft.blocks) {
    const builder = instantiateBlock(block, `${ref}#${block.name}`, context);
    components[block.name] = await builder.serialize();
  }
  return {
    ok: true,
    data: { components, degraded: context.degraded },
    changes: [],
  };
}
