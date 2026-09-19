import type { ZodType, ZodTypeAny, ZodTypeDef } from "zod";

/**
 * Asserts an options schema against the factory's own options type: a schema
 * whose input drifts from the interface stops compiling.
 *
 * ```typescript
 * export const GridSchema = z.object({ … }) satisfies BlockOptionsFor<GridOptions>;
 * ```
 */
export type BlockOptionsFor<Options> = ZodType<unknown, ZodTypeDef, Options>;

/**
 * The editor control a block option is best edited with. `text` is the fallback
 * when no hint is declared and the option is a plain string.
 */
export type BlockOptionWidget =
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
  | "query"
  | "dataSource"
  | "permission"
  | "json"
  | "block";

/** Presentation hints a builder UI applies to one option. */
export interface BlockOptionUi {
  /** Human label; defaults to the option key when absent. */
  label?: string;
  widget?: BlockOptionWidget;
  /** Section the option is grouped under in the config panel. */
  group?: BlockOptionGroup;
  /** Sort order within the group; unordered options follow declaration order. */
  order?: number;
  /** Excluded from the config panel (transport-only options). */
  hidden?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /**
   * Dotted path to the option whose value scopes this one — a `field` widget
   * scoped by the block's resource, for instance.
   */
  scope?: string;
  /** Block types accepted by a `block` widget. */
  blockTypes?: string[];
  /**
   * The aspect(s) a `field` widget's value must carry on the resource. Sorting
   * on a field that is not sortable, or filtering on one that is not
   * filterable, is written and then ignored at runtime — so the option says
   * which aspects it needs and the value is checked against every one of them.
   *
   * An option may need more than one: a Kanban groups by a field it both reads
   * off the listed row and filters each column with.
   */
  fieldAspect?: FieldAspect | FieldAspect[];
  /**
   * Render an object option's own properties in its group rather than nested
   * under its label — a set of switches that reads as one list of features.
   */
  flatten?: boolean;
  /**
   * What the block does with what it fetches, for a `dataSource` option.
   *
   * A source editor offers only the calculations whose answer this block can
   * read: a card wants one number, a chart wants one point per group, a ranked
   * list wants those points as entries. Without it an editor would let someone
   * wire a series into a slot that renders a single value.
   */
  responseShape?: BlockResponseShape;
  /**
   * The option this block reads its period from, for a `dataSource` option.
   *
   * Binding a source to a period means writing two options at once — the source
   * itself, and the scope it follows — and only the block knows what its own
   * period option is called.
   */
  periodOption?: string;
}

/**
 * The shape of the answer a block reads from its data source.
 *
 * `value` is one number, `series` one point per group, `items` those points as a
 * ranked list, and `card` a number and its series together.
 */
export type BlockResponseShape = "value" | "series" | "items" | "card";

/**
 * A resource aspect a field must carry for an option naming it to work at
 * runtime: listed by the list route, full-text searchable, sortable, or
 * column-filterable.
 */
export type FieldAspect = "listable" | "searchable" | "sortable" | "filterable";

/** The sections a config panel lays its options out in, in this order. */
export type BlockOptionGroup =
  | "content"
  | "features"
  | "data"
  | "appearance"
  | "layout"
  | "behavior"
  | "advanced";

/** The primitive kinds a described option can reduce to. */
export type BlockOptionType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "record"
  | "union"
  | "unknown";

/**
 * A JSON-serializable description of one option, derived from its zod schema.
 * Nested shapes are described recursively through `properties`, `items`,
 * `values` and `oneOf`.
 */
export interface BlockOptionSchema {
  type: BlockOptionType;
  optional?: boolean;
  nullable?: boolean;
  description?: string;
  default?: unknown;
  enum?: Array<string | number | boolean>;
  /** Object shape, keyed by property name. */
  properties?: Record<string, BlockOptionSchema>;
  /** Array element shape. */
  items?: BlockOptionSchema;
  /** Record value shape. */
  values?: BlockOptionSchema;
  /** Union branches, in declaration order. */
  oneOf?: BlockOptionSchema[];
  /** Property carrying the branch tag of a discriminated union. */
  discriminator?: string;
  /** Positional element shapes of a tuple, in order. */
  prefixItems?: BlockOptionSchema[];
  /** Shapes a value must satisfy at once, for an intersection. */
  allOf?: BlockOptionSchema[];
  /**
   * The shape is deeper than the walker describes. What is reported is accurate
   * as far as it goes; the value has more structure below it.
   */
  truncated?: boolean;
  ui?: BlockOptionUi;
}

/** A named region a container block renders its children into. */
export interface BlockSlotDefinition {
  id: string;
  label?: string;
  description?: string;
}

/**
 * A container whose slots are declared by its own options rather than fixed —
 * `Tab`, whose `items[].slot` names each region.
 */
export interface BlockDynamicSlots {
  /** Dotted path to the option array holding the slot descriptors. */
  optionPath: string;
  /** Property of each entry holding the slot id. */
  idKey: string;
  /** Property of each entry holding the slot label. */
  labelKey?: string;
}

/** Palette metadata for a block type. */
export interface BlockTypeMeta {
  name: string;
  icon?: string;
  description?: string;
  /** Palette section, e.g. `layout` | `data` | `visualization`. */
  group?: BlockTypeGroup;
}

export type BlockTypeGroup = "layout" | "content" | "data" | "visualization";

/** A block type as declared next to its factory. */
export interface BlockTypeDefinition {
  /** Factory export name — the catalog key, e.g. `KpiCard`. */
  type: string;
  /** Frontend component name the factory emits, e.g. `dms-kpi-card`. */
  componentName: string;
  meta: BlockTypeMeta;
  /**
   * Options schema; absent for a factory taking none.
   *
   * `watchActions` is deliberately left out of every declaration: it carries the
   * reactivity wiring `.watch()` emits, not a value an author sets by hand, so a
   * builder has no business offering it.
   */
  schema?: ZodTypeAny;
  /** Whether the block accepts `.child(...)`. */
  container?: boolean;
  /** Block types accepted as children; any type when absent. */
  allowedChildren?: string[];
  slots?: BlockSlotDefinition[];
  dynamicSlots?: BlockDynamicSlots;
  /** Schema of the metadata a child carries, e.g. `{ colSpan }`. */
  childMeta?: ZodTypeAny;
  /**
   * Options the factory sets itself, whatever the caller passes — a chart's
   * `type`, which is what tells `dms-chart` which chart to draw. A consumer
   * rendering from the descriptor alone has to merge these in.
   */
  fixedOptions?: Record<string, unknown>;
  /** Whether the factory takes a leading controller class before its options. */
  controllerArg?: boolean;
}

/** A block type as reported by `ListBlockTypes`, with its schemas described. */
export interface BlockTypeDescriptor extends Omit<
  BlockTypeDefinition,
  "schema" | "childMeta"
> {
  config: Record<string, BlockOptionSchema>;
  childMeta?: Record<string, BlockOptionSchema>;
  /** Option values the factory applies when the caller omits them. */
  defaults: Record<string, unknown>;
}
