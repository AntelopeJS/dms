import type { JsonValue } from "../../../../dms-core/app/types/json";
import {
  isBoolean,
  isNumber,
  isString,
} from "../../../../dms-core/app/utils/type-check";
import {
  isJsonObject,
  isObjectValue,
  type JsonObject,
  type JsonWritable,
} from "./json";
import type { MockupSpecNode } from "./mockupSpec";

/**
 * The block catalog `GET /api/mockup/schema/blocks` answers, as the editor
 * reads it: a mirror of the part of `BlockTypeDescriptor` it uses.
 */

/** Presentation hints of one option (`BlockOptionUi`). */
export interface MockupOptionUi {
  label?: string;
  widget?: string;
  group?: string;
  order?: number;
  hidden?: boolean;
  advanced?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  valueLabels?: Record<string, string>;
  initial?: JsonValue;
  blockTypes?: string[];
}

/** One option of a block (`BlockOptionSchema`). */
export interface MockupOptionSchema {
  type: string;
  optional?: boolean;
  default?: JsonValue;
  enum?: Array<string | number | boolean>;
  ui?: MockupOptionUi;
}

/** A child a new block starts with (`BlockInitialChild`). */
export interface MockupInitialChild {
  id: string;
  type: string;
  options: JsonObject;
}

/** One registered block type (`BlockTypeDescriptor`). */
export interface MockupBlockType {
  type: string;
  componentName: string;
  meta: { name: string; icon?: string; description?: string; group?: string };
  container?: boolean;
  allowedChildren?: string[];
  config: Record<string, MockupOptionSchema>;
  defaults: JsonObject;
  initialChildren?: MockupInitialChild[];
}

/** The palette sections, in the order the Add tab lists them. */
export const MOCKUP_CATALOG_GROUPS = [
  "layout",
  "content",
  "data",
  "visualization",
  "other",
] as const;

export type MockupCatalogGroup = (typeof MOCKUP_CATALOG_GROUPS)[number];

/** One section of the Add tab. */
export interface MockupCatalogSection {
  group: MockupCatalogGroup;
  blocks: MockupBlockType[];
}

function isStringList(value: JsonValue): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOptionalOf<Value extends JsonValue>(
  value: JsonValue | undefined,
  guard: (entry: JsonValue) => entry is Value,
): value is Value | undefined {
  return value === undefined || guard(value);
}

function isLabels(value: JsonValue): value is Record<string, string> {
  return isObjectValue(value) && Object.values(value).every(isString);
}

function isOptionUi(value: JsonValue): value is JsonObject & MockupOptionUi {
  if (!isObjectValue(value)) return false;
  const strings = ["label", "widget", "group", "placeholder"];
  const numbers = ["order", "min", "max", "step"];
  return (
    strings.every((key) => isOptionalOf(value[key], isString)) &&
    numbers.every((key) => isOptionalOf(value[key], isNumber)) &&
    isOptionalOf(value.hidden, isBoolean) &&
    isOptionalOf(value.advanced, isBoolean) &&
    isOptionalOf(value.valueLabels, isLabels) &&
    isOptionalOf(value.blockTypes, isStringList)
  );
}

function isEnumValue(value: JsonValue): value is string | number | boolean {
  return isString(value) || isNumber(value) || isBoolean(value);
}

function isEnumList(
  value: JsonValue,
): value is Array<string | number | boolean> {
  return Array.isArray(value) && value.every(isEnumValue);
}

function isOptionSchema(
  value: JsonValue,
): value is JsonObject & MockupOptionSchema {
  return (
    isObjectValue(value) &&
    isString(value.type) &&
    isOptionalOf(value.optional, isBoolean) &&
    isOptionalOf(value.enum, isEnumList) &&
    isOptionalOf(value.ui, isOptionUi)
  );
}

function isInitialChild(
  value: JsonValue,
): value is JsonObject & MockupInitialChild {
  return (
    isObjectValue(value) &&
    isString(value.id) &&
    isString(value.type) &&
    isObjectValue(value.options)
  );
}

function isInitialChildList(
  value: JsonValue,
): value is Array<JsonObject & MockupInitialChild> {
  return Array.isArray(value) && value.every(isInitialChild);
}

function isMeta(
  value: JsonValue,
): value is JsonObject & MockupBlockType["meta"] {
  return (
    isObjectValue(value) &&
    isString(value.name) &&
    isOptionalOf(value.icon, isString) &&
    isOptionalOf(value.description, isString) &&
    isOptionalOf(value.group, isString)
  );
}

function isBlockType(value: JsonValue): value is JsonObject & MockupBlockType {
  return (
    isObjectValue(value) &&
    isString(value.type) &&
    isString(value.componentName) &&
    isMeta(value.meta) &&
    isOptionalOf(value.container, isBoolean) &&
    isOptionalOf(value.allowedChildren, isStringList) &&
    isObjectValue(value.config) &&
    Object.values(value.config).every(isOptionSchema) &&
    isObjectValue(value.defaults) &&
    isOptionalOf(value.initialChildren, isInitialChildList)
  );
}

/** The block types of a catalog answer, those it describes wrongly left out; none when the answer is not a JSON object with a `blocks` list. */
export function parseBlockCatalog(
  value: JsonWritable | undefined,
): MockupBlockType[] | undefined {
  if (!isJsonObject(value) || !Array.isArray(value.blocks)) return undefined;
  return value.blocks.filter(isBlockType);
}

function sectionOf(block: MockupBlockType): MockupCatalogGroup {
  return (
    MOCKUP_CATALOG_GROUPS.find((group) => group === block.meta.group) ?? "other"
  );
}

function matches(block: MockupBlockType, query: string): boolean {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return true;
  return [block.meta.name, block.type, block.meta.description ?? ""].some(
    (text) => text.toLowerCase().includes(wanted),
  );
}

/** The Add tab's sections: the blocks `query` matches, by palette group, empty groups left out. */
export function catalogSections(
  blocks: readonly MockupBlockType[],
  query: string,
): MockupCatalogSection[] {
  const found = blocks.filter((block) => matches(block, query));
  return MOCKUP_CATALOG_GROUPS.map((group) => ({
    group,
    blocks: found.filter((block) => sectionOf(block) === group),
  })).filter((section) => section.blocks.length > 0);
}

/** Whether a node of type `child` may go under a node of type `parent`; the page root takes any. */
export function acceptsChild(
  parent: MockupBlockType | undefined,
  child: string,
): boolean {
  if (!parent?.container) return false;
  return !parent.allowedChildren || parent.allowedChildren.includes(child);
}

/** `KpiCard` → `kpi-card`: the id a new node of that type takes. */
export function nodeIdFor(type: string): string {
  return type
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase();
}

const NAMED_BY_BLOCK = new Set(["title", "label", "caption"]);

/** The value a new block gives a required option the factory has no default for. */
function placeholderFor(
  key: string,
  option: MockupOptionSchema,
  block: MockupBlockType,
): JsonValue | undefined {
  const [first] = option.enum ?? [];
  if (first !== undefined) return first;
  switch (option.type) {
    case "string":
      return NAMED_BY_BLOCK.has(key)
        ? block.meta.name
        : (option.ui?.label ?? key);
    case "number":
      return option.ui?.min ?? 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
    case "record":
      return {};
    default:
      return undefined;
  }
}

function startingOptions(block: MockupBlockType): JsonObject {
  const options: JsonObject = { ...block.defaults };
  for (const [key, option] of Object.entries(block.config)) {
    if (option.ui?.initial !== undefined) options[key] = option.ui.initial;
    const isMissing = !option.optional && !Object.hasOwn(options, key);
    if (!isMissing || option.ui?.widget === "block") continue;
    const value = placeholderFor(key, option, block);
    if (value !== undefined) options[key] = value;
  }
  return options;
}

const MAX_NEW_BLOCK_DEPTH = 3;

/** What a new block takes from, and adds to, the page it is placed on. */
interface StarterScope {
  catalog: ReadonlyMap<string, MockupBlockType>;
  /** The page's fixtures, new ones included. */
  fixtures: JsonObject;
  added: JsonObject;
}

const SAMPLE_ROWS = [
  { id: "1", name: "Ada Lovelace", status: "Active", amount: 1200 },
  { id: "2", name: "Grace Hopper", status: "Pending", amount: 860 },
  { id: "3", name: "Alan Turing", status: "Active", amount: 2450 },
];

const SAMPLE_RECORD = { name: "Ada Lovelace", email: "ada@example.com" };

function formField(id: string, label: string, component: string) {
  return {
    id,
    label,
    type: "string",
    component: { componentName: component, options: {}, children: [] },
  };
}

/**
 * The blocks that take a controller class in code. A mockup builds each from
 * a page fixture, so a new one starts with sample values to read and the
 * options the compiler asks for.
 */
const CONTROLLER_STARTERS = new Map<
  string,
  { sample: JsonValue; options: (reference: string) => JsonObject }
>([
  [
    "TableView",
    {
      sample: SAMPLE_ROWS,
      options: (reference) => ({
        caption: "Customers",
        fetchUrl: reference,
        rowIdKey: "id",
        columns: {
          name: { name: "Name", type: "string" },
          status: { name: "Status", type: "string" },
          amount: { name: "Amount", type: "number" },
        },
      }),
    },
  ],
  [
    "ResourceForm",
    {
      sample: SAMPLE_RECORD,
      options: (reference) => ({
        mode: "edit",
        fetchUrl: reference,
        fields: [
          formField("name", "Name", "dms-input-text"),
          formField("email", "Email", "dms-input-text"),
        ],
      }),
    },
  ],
]);

/**
 * The options a new block starts with beyond its defaults, for a block that
 * draws nothing without them: a form with no fields shows an empty card.
 */
const STARTER_OPTIONS = new Map<string, JsonObject>([
  [
    "Form",
    {
      title: "Form",
      fields: [formField("name", "Name", "dms-input-text")],
      sections: [
        {
          id: "contact",
          label: "Contact",
          fields: [formField("email", "Email", "dms-input-text")],
        },
      ],
    },
  ],
]);

/** `wanted`, or the first `<wanted>-<n>` the page has no fixture under. */
function freshKey(fixtures: JsonObject, wanted: string): string {
  let key = wanted;
  for (let suffix = 2; Object.hasOwn(fixtures, key); suffix += 1) {
    key = `${wanted}-${suffix}`;
  }
  return key;
}

function startingNode(
  block: MockupBlockType,
  scope: StarterScope,
): MockupSpecNode {
  const id = nodeIdFor(block.type);
  const controller = CONTROLLER_STARTERS.get(block.type);
  if (!controller) {
    const node: MockupSpecNode = { id, type: block.type };
    const options = {
      ...startingOptions(block),
      ...STARTER_OPTIONS.get(block.type),
    };
    if (Object.keys(options).length) node.options = options;
    return node;
  }
  const key = freshKey(scope.fixtures, `${id}-data`);
  scope.fixtures[key] = controller.sample;
  scope.added[key] = controller.sample;
  return {
    id,
    type: block.type,
    options: controller.options(`fixture:${key}`),
  };
}

/** The children a required `block` option of `block` asks for, as `ChartCard`'s `chart`. */
function blockOptionChildren(
  block: MockupBlockType,
  scope: StarterScope,
  depth: number,
): MockupSpecNode[] {
  return Object.entries(block.config).flatMap(([key, option]) => {
    const [type] = option.ui?.blockTypes ?? [];
    const child = type === undefined ? undefined : scope.catalog.get(type);
    if (option.optional || option.ui?.widget !== "block" || !child) return [];
    return [{ ...startingBlock(child, scope, depth + 1), id: key }];
  });
}

function startingBlock(
  block: MockupBlockType,
  scope: StarterScope,
  depth: number,
): MockupSpecNode {
  const node = startingNode(block, scope);
  const children: MockupSpecNode[] = [
    ...(block.initialChildren ?? []).map((child) => ({
      id: child.id,
      type: child.type,
      options: { ...child.options },
    })),
    ...(depth < MAX_NEW_BLOCK_DEPTH
      ? blockOptionChildren(block, scope, depth)
      : []),
  ];
  if (children.length) node.children = children;
  return node;
}

/** A block placed from the catalog: its node and the page fixtures it adds. */
export interface MockupNewBlock {
  node: MockupSpecNode;
  fixtures: JsonObject;
}

/**
 * The node a block placed from the catalog starts as: its defaults, the
 * values its options ask an editor to place it with, its initial children,
 * and a stand-in for each required option nothing else fills. A block that
 * reads page fixtures (a table, a form) starts with sample ones, under keys
 * `pageFixtures` lacks; they come back in `fixtures`, for the same edit to
 * write into the page.
 */
export function newBlock(
  block: MockupBlockType,
  catalog: ReadonlyMap<string, MockupBlockType>,
  pageFixtures: JsonObject = {},
): MockupNewBlock {
  const scope: StarterScope = {
    catalog,
    fixtures: { ...pageFixtures },
    added: {},
  };
  const node = startingBlock(block, scope, 0);
  return { node, fixtures: scope.added };
}
