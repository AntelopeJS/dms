import {
  isBoolean,
  isNumber,
  isObject,
  isString,
} from "../../../../dms-core/app/utils/type-check";
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
  initial?: unknown;
  blockTypes?: string[];
}

/** One option of a block (`BlockOptionSchema`). */
export interface MockupOptionSchema {
  type: string;
  optional?: boolean;
  default?: unknown;
  enum?: Array<string | number | boolean>;
  ui?: MockupOptionUi;
}

/** A child a new block starts with (`BlockInitialChild`). */
export interface MockupInitialChild {
  id: string;
  type: string;
  options: Record<string, unknown>;
}

/** One registered block type (`BlockTypeDescriptor`). */
export interface MockupBlockType {
  type: string;
  componentName: string;
  meta: { name: string; icon?: string; description?: string; group?: string };
  container?: boolean;
  allowedChildren?: string[];
  config: Record<string, MockupOptionSchema>;
  defaults: Record<string, unknown>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isOptionalOf(
  value: unknown,
  guard: (entry: unknown) => boolean,
): boolean {
  return value === undefined || guard(value);
}

function isLabels(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(isString);
}

function isOptionUi(value: unknown): value is MockupOptionUi {
  if (!isRecord(value)) return false;
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

function isEnumValue(value: unknown): value is string | number | boolean {
  return isString(value) || isNumber(value) || isBoolean(value);
}

function isOptionSchema(value: unknown): value is MockupOptionSchema {
  return (
    isRecord(value) &&
    isString(value.type) &&
    isOptionalOf(value.optional, isBoolean) &&
    isOptionalOf(
      value.enum,
      (entry) => Array.isArray(entry) && entry.every(isEnumValue),
    ) &&
    isOptionalOf(value.ui, isOptionUi)
  );
}

function isInitialChild(value: unknown): value is MockupInitialChild {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.type) &&
    isRecord(value.options)
  );
}

function isMeta(value: unknown): value is MockupBlockType["meta"] {
  return (
    isRecord(value) &&
    isString(value.name) &&
    isOptionalOf(value.icon, isString) &&
    isOptionalOf(value.description, isString) &&
    isOptionalOf(value.group, isString)
  );
}

function isBlockType(value: unknown): value is MockupBlockType {
  return (
    isRecord(value) &&
    isString(value.type) &&
    isString(value.componentName) &&
    isMeta(value.meta) &&
    isOptionalOf(value.container, isBoolean) &&
    isOptionalOf(value.allowedChildren, isStringList) &&
    isRecord(value.config) &&
    Object.values(value.config).every(isOptionSchema) &&
    isRecord(value.defaults) &&
    isOptionalOf(
      value.initialChildren,
      (entry) => Array.isArray(entry) && entry.every(isInitialChild),
    )
  );
}

/** The block types of a catalog answer, those it describes wrongly left out. */
export function parseBlockCatalog(
  value: unknown,
): MockupBlockType[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.blocks)) return undefined;
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
    .replace(/[^A-Za-z0-9]+/g, "-")
    .toLowerCase();
}

const NAMED_BY_BLOCK = new Set(["title", "label", "caption"]);

/** The value a new block gives a required option the factory has no default for. */
function placeholderFor(
  key: string,
  option: MockupOptionSchema,
  block: MockupBlockType,
): unknown {
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

function startingOptions(block: MockupBlockType): Record<string, unknown> {
  const options: Record<string, unknown> = { ...block.defaults };
  for (const [key, option] of Object.entries(block.config)) {
    if (option.ui?.initial !== undefined) options[key] = option.ui.initial;
    const isMissing = !option.optional && !Object.hasOwn(options, key);
    if (!isMissing || option.ui?.widget === "block") continue;
    const value = placeholderFor(key, option, block);
    if (value !== undefined) options[key] = value;
  }
  return options;
}

/** The children a required `block` option of `block` asks for, as `ChartCard`'s `chart`. */
function blockOptionChildren(
  block: MockupBlockType,
  catalog: ReadonlyMap<string, MockupBlockType>,
  depth: number,
): MockupSpecNode[] {
  return Object.entries(block.config).flatMap(([key, option]) => {
    const [type] = option.ui?.blockTypes ?? [];
    const child = type === undefined ? undefined : catalog.get(type);
    if (option.optional || option.ui?.widget !== "block" || !child) return [];
    return [{ ...newBlockNode(child, catalog, depth + 1), id: key }];
  });
}

const MAX_NEW_BLOCK_DEPTH = 3;

/**
 * The node a block placed from the catalog starts as: its defaults, the
 * values its options ask an editor to place it with, its initial children,
 * and a stand-in for each required option nothing else fills.
 */
export function newBlockNode(
  block: MockupBlockType,
  catalog: ReadonlyMap<string, MockupBlockType>,
  depth = 0,
): MockupSpecNode {
  const node: MockupSpecNode = { id: nodeIdFor(block.type), type: block.type };
  const options = startingOptions(block);
  if (Object.keys(options).length) node.options = options;
  const children: MockupSpecNode[] = [
    ...(block.initialChildren ?? []).map((child) => ({
      id: child.id,
      type: child.type,
      options: { ...child.options },
    })),
    ...(depth < MAX_NEW_BLOCK_DEPTH
      ? blockOptionChildren(block, catalog, depth)
      : []),
  ];
  if (children.length) node.children = children;
  return node;
}
