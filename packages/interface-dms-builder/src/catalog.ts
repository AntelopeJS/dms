import type { ConfigObject } from "./values";

/**
 * An import the emitter must add: `import { <name> } from "<module>"`. Either a
 * package `module` specifier (fixed, file-independent) or a `targetFile` absolute
 * path resolved to a relative specifier against the emitting file (e.g. a `$ref`
 * to a local resource class).
 */
export interface ImportRef {
  name: string;
  module?: string;
  targetFile?: string;
}

/** A named region of a container block (e.g. a Tab's slots). */
export interface SlotDescriptor {
  id: string;
  label?: string;
  description?: string;
}

/**
 * A container whose slots come from its own options rather than being fixed —
 * `Tab`, whose `items[].slot` names each region. Read the option at `optionPath`
 * of the block's config to enumerate them.
 */
export interface DynamicSlots {
  optionPath: string;
  idKey: string;
  labelKey?: string;
}

/** The editor control an option is best edited with. */
export type OptionWidget =
  | "text"
  | "textarea"
  | "number"
  | "range"
  | "switch"
  | "select"
  | "segmented"
  | "icon"
  | "color"
  | "url"
  | "resource"
  | "field"
  | "dataType"
  | "dataSource"
  | "permission"
  | "json"
  | "block";

/** How a builder UI should present one option. */
/** A resource aspect a field must carry for an option naming it to work. */
export type FieldAspect = "listable" | "searchable" | "sortable" | "filterable";

export interface OptionUi {
  label?: string;
  widget?: OptionWidget;
  /** Section the option belongs to: `content` | `data` | `appearance` | … */
  group?: string;
  order?: number;
  /** Not editable from a config panel — transport-only or code-only. */
  hidden?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Dotted path to the option whose value scopes this one. */
  scope?: string;
  /** Block types a `block` widget accepts. */
  blockTypes?: string[];
  /**
   * The options of the block a `block` widget holds that the block holding it
   * supplies itself: a card fetches and heads the chart it wraps.
   */
  supplies?: string[];
  /**
   * The aspect, or aspects, a `field` widget's value must carry on the
   * resource. Naming a field that lacks one is written and then ignored at
   * runtime, so it is refused instead.
   */
  fieldAspect?: FieldAspect | FieldAspect[];
  /**
   * Render an object option's own properties in its group rather than nested
   * under its label — a set of switches that reads as one list of features.
   */
  flatten?: boolean;
  /**
   * What to call each value of an enum, keyed by the value: `Last 30 days`
   * rather than `last-30-days`.
   */
  valueLabels?: Record<string, string>;
  /**
   * The sibling option this one's value can be derived from — a field's key
   * from its label. The builder writes it itself in its simple mode.
   */
  derivedFrom?: string;
  /**
   * The switch this option sits behind, by its label: offered once an author
   * turns it on, left out while it is off.
   */
  optIn?: string;
  /**
   * The sibling option holding the data type this value is one of: a field's
   * default takes the input its type calls for.
   */
  typedBy?: string;
  /** Offered in the builder's advanced view only. */
  advanced?: boolean;
  /** What the builder places a new block with, when not the option's default. */
  initial?: unknown;
}

/** The primitive kinds a described option reduces to. */
export type OptionType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "record"
  /** Branches of differing kinds; read `oneOf` rather than `type`. */
  | "union"
  | "unknown";

/**
 * A JSON-Schema-ish description of one option. Two DMS extensions carry over
 * from the inferred path: `x-dataType` marks a value that is a
 * `new <DataType>(...)` instance (a Form field's `type`), and `x-component`
 * marks one that holds a nested component.
 */
export interface OptionSchema {
  type: OptionType;
  optional?: boolean;
  nullable?: boolean;
  description?: string;
  default?: unknown;
  enum?: Array<string | number | boolean>;
  /** Object shape, keyed by property name. */
  properties?: Record<string, OptionSchema>;
  /** Array element shape. */
  items?: OptionSchema;
  /** Record value shape. */
  values?: OptionSchema;
  /**
   * Record key shape. A key drawn from a closed set carries it as `enum`, so
   * an editor can offer one entry per key.
   */
  keys?: OptionSchema;
  /** Union branches, in declaration order. */
  oneOf?: OptionSchema[];
  /** Property carrying the branch tag of a discriminated union. */
  discriminator?: string;
  /** Positional element shapes of a tuple, in order. */
  prefixItems?: OptionSchema[];
  /** Shapes a value must satisfy at once, for an intersection. */
  allOf?: OptionSchema[];
  /**
   * The shape is deeper than the catalog describes. What is reported is
   * accurate as far as it goes; the value has more structure below it.
   */
  truncated?: boolean;
  ui?: OptionUi;
  "x-dataType"?: boolean;
  "x-component"?: boolean;
  /**
   * The option is handed a table's DataAPI class — a relation's
   * `dataApiController`. Its value is a `$ref` to a resource.
   */
  "x-controller"?: boolean;
}

/**
 * A block's or DataType's options, keyed by option name. Declared schemas
 * (`configOrigin: "annotated"`) carry labels, defaults and widgets; inferred ones
 * carry only what the TypeScript signature revealed.
 */
export type ConfigSchema = Record<string, OptionSchema>;

/** How a block type's emit shape was determined. */
export type ConfigOrigin = "inferred" | "annotated";

/**
 * The palette section a block type belongs to. The four the DMS ships are
 * spelled out; a newer DMS declaring another one passes through rather than
 * being dropped, so its blocks stay listable.
 */
export type BlockGroup =
  | "layout"
  | "content"
  | "data"
  | "visualization"
  | (string & {});

/** A block factory the builder can emit and configure. Keyed on `type`. */
export interface BlockTypeDescriptor {
  /** Factory export name, e.g. `KpiCard` — the catalog key. */
  type: string;
  import: ImportRef;
  /** Frontend component name the factory emits, e.g. `dms-kpi-card`. */
  componentName?: string;
  /** Human label for the palette; falls back to `type`. */
  label?: string;
  icon?: string;
  group?: BlockGroup;
  /** Whether the block accepts `.child(...)`. */
  container: boolean;
  /** Block types accepted as children; any type when absent. */
  allowedChildren?: string[];
  slots?: SlotDescriptor[];
  dynamicSlots?: DynamicSlots;
  config: ConfigSchema;
  /** Option values the factory applies when the caller omits them. */
  defaults?: ConfigObject;
  /** Schema of the metadata a child carries, e.g. `{ colSpan }`. */
  childMeta?: ConfigSchema;
  /**
   * Options the factory sets itself whatever the caller passes — a chart's
   * `type`, which is what tells `dms-chart` which chart to draw. Emitting them
   * is unnecessary; a consumer rendering from the descriptor alone merges them
   * in.
   */
  fixedOptions?: ConfigObject;
  configOrigin: ConfigOrigin;
  description?: string;
  /**
   * True when the factory takes a leading controller-class argument before its
   * options object (e.g. `TableView(controller, options)`). Such blocks require
   * `AddBlockInput.controller`; `config` describes the options (second) argument.
   */
  controllerArg?: boolean;
  /**
   * The children an editor places in a new block of this type, as the DMS's
   * own helper places them in code: a `PageToolbar`'s `LiveToggle` and
   * `PeriodSelector` with the defaults of `pageToolbar()`.
   */
  initialChildren?: BlockInitialChild[];
}

/** One child a new block starts with (see `BlockTypeDescriptor.initialChildren`). */
export interface BlockInitialChild {
  /** The child id under its parent, the one roles name it by. */
  id: string;
  /** The child's block type, a key of the catalog (`LiveToggle`). */
  type: string;
  /** The child's options. */
  options: ConfigObject;
}

/** A DataType usable as a Form field's `type`. */
export interface DataTypeDescriptor {
  /** Registered id, e.g. `string` | `number` | `select`. */
  id: string;
  import: ImportRef;
  config: ConfigSchema;
  description?: string;
}

/** The full set of block types and DataTypes the builder can emit. */
export interface BlockCatalog {
  blocks: BlockTypeDescriptor[];
  dataTypes: DataTypeDescriptor[];
  /**
   * Names a resource field may not take: they collide with a generated
   * DataController route or a Model member, and are rejected with
   * `invalid_config`. Reported here so a caller can pick a valid name up front
   * rather than carrying its own copy of the list.
   */
  reservedFieldNames: string[];
  /** Cache key; invalidated on module-source change. */
  generatedAt: string;
}

/**
 * A route a developer declared as something a block may read.
 *
 * Listed beside the calculations the builder generates, so a source editor
 * offers both in one place. The builder never reads or rewrites the code behind
 * one: it knows only what the declaration says.
 */
export interface DataSourceDescriptor {
  id: string;
  title: string;
  description?: string;
  /** The shape it answers with, matched against what a block can read. */
  responseKind: string;
  /** The path a block fetches, as declared. */
  path: string;
  method?: string;
  /** Parameters it takes, in the same vocabulary as a block's options. */
  params?: ConfigSchema;
  /** The query parameters it reads a period from, when it takes one. */
  period?: { from: string; to: string };
}
