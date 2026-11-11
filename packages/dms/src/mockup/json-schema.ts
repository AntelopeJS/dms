import type {
  BlockOptionSchema,
  BlockTypeDescriptor,
} from "@antelopejs/interface-dms/base/block-types";
import { CONTROLLER_BLOCKS } from "./controller-blocks";
import type { Json, JsonObject } from "./model";
import { jsonSchema, KEY_PATTERN, MAX_PAGES, SLUG_PATTERN } from "./model";
import {
  SKETCH_DEFAULT_HEIGHT,
  SKETCH_MAX_CAPTION,
  SKETCH_MAX_HEIGHT,
  SKETCH_MIN_HEIGHT,
  SKETCH_TYPE,
} from "./sketch";
import { previewOptionsOf } from "./validate";

const DRAFT = "https://json-schema.org/draft/2020-12/schema";
const NODE_REF: JsonObject = { $ref: "#/$defs/node" };

type Describe = (option: BlockOptionSchema) => JsonObject;

/** The JSON Schema type of each described option type. */
const OPTION_TYPES: Record<BlockOptionSchema["type"], Describe> = {
  string: () => ({ type: "string" }),
  number: () => ({ type: "number" }),
  boolean: () => ({ type: "boolean" }),
  unknown: () => ({}),
  object: (option) => objectSchema(option.properties ?? {}),
  array: (option) => ({
    type: "array",
    ...(option.items && { items: describeOption(option.items) }),
    ...(option.prefixItems && {
      prefixItems: option.prefixItems.map(describeOption),
    }),
  }),
  record: (option) => ({
    type: "object",
    ...(option.values && {
      additionalProperties: describeOption(option.values),
    }),
    ...(option.keys?.enum && { propertyNames: { enum: option.keys.enum } }),
  }),
  union: (option): JsonObject =>
    option.oneOf?.length ? { anyOf: option.oneOf.map(describeOption) } : {},
};

function annotations(option: BlockOptionSchema): JsonObject {
  const value: JsonObject = {};
  if (option.description) value.description = option.description;
  if (option.enum) value.enum = option.enum;
  if (option.allOf) value.allOf = option.allOf.map(describeOption);
  const fallback = jsonSchema.safeParse(option.default);
  if (option.default !== undefined && fallback.success) {
    value.default = fallback.data;
  }
  return value;
}

/** One option described by the registry, as JSON Schema. */
function describeOption(option: BlockOptionSchema): JsonObject {
  const described: JsonObject = {
    ...OPTION_TYPES[option.type](option),
    ...annotations(option),
  };
  return option.nullable ? { anyOf: [described, { type: "null" }] } : described;
}

function isRequired(option: BlockOptionSchema): boolean {
  return !option.optional && option.default === undefined;
}

/**
 * An options object. It stays open: the preview format carries keys a
 * factory's input lacks, a serialized form's `fieldIds` for one.
 */
function objectSchema(
  properties: Record<string, BlockOptionSchema>,
): JsonObject {
  const entries = Object.entries(properties);
  const required: Json[] = entries
    .filter(([, option]) => isRequired(option))
    .map(([key]) => key);
  return {
    type: "object",
    properties: Object.fromEntries(
      entries.map(([key, option]) => [key, describeOption(option)]),
    ),
    ...(required.length && { required }),
  };
}

const NODE_PLACEMENT: JsonObject = {
  id: { type: "string", description: "The child's id under its parent." },
  slot: { type: "string", description: "The parent's slot it renders in." },
  colSpan: { type: "number", description: "Columns it spans in a grid." },
};

function blockNode(type: string, options: JsonObject): JsonObject {
  return {
    type: "object",
    required: ["type"],
    properties: {
      type: { const: type },
      options,
      children: { type: "array", items: NODE_REF },
      ...NODE_PLACEMENT,
    },
  };
}

/** The options a spec writes for a block type, or undefined if none can be. */
function blockOptions(descriptor: BlockTypeDescriptor): JsonObject | undefined {
  if (!descriptor.controllerArg) {
    return objectSchema(previewOptionsOf(descriptor));
  }
  const block = CONTROLLER_BLOCKS.get(descriptor.type);
  return block ? objectSchema(block.options(descriptor)) : undefined;
}

const SKETCH_NODE: JsonObject = {
  type: "object",
  required: ["type", "options"],
  description: "Static HTML and CSS of a part the DMS has no block for.",
  properties: {
    type: { const: SKETCH_TYPE },
    options: {
      type: "object",
      required: ["html"],
      additionalProperties: false,
      properties: {
        html: { type: "string" },
        css: { type: "string" },
        height: {
          type: "integer",
          minimum: SKETCH_MIN_HEIGHT,
          maximum: SKETCH_MAX_HEIGHT,
          default: SKETCH_DEFAULT_HEIGHT,
        },
        caption: { type: "string", maxLength: SKETCH_MAX_CAPTION },
      },
    },
    children: { type: "array", maxItems: 0 },
    ...NODE_PLACEMENT,
  },
};

const COMPONENT_NODE: JsonObject = {
  type: "object",
  required: ["componentName"],
  not: { required: ["type"] },
  description: "A block named by the component it emits, e.g. dms-kpi-card.",
  properties: {
    componentName: { type: "string" },
    options: { type: "object" },
    children: { type: "array", items: NODE_REF },
    ...NODE_PLACEMENT,
  },
};

function pageDefinition(): JsonObject {
  return {
    type: "object",
    required: ["id", "title", "tree"],
    additionalProperties: false,
    properties: {
      id: { type: "string", pattern: SLUG_PATTERN.source },
      title: { type: "string" },
      options: {
        type: "object",
        additionalProperties: false,
        properties: {
          theme: { enum: ["light", "dark"] },
          locale: { type: "string" },
          padding: { type: "boolean", default: true },
        },
      },
      fixtures: {
        type: "object",
        propertyNames: { pattern: KEY_PATTERN.source },
        description:
          'Data a block reads: an option "fixture:<key>" is served from here.',
      },
      tree: { type: "array", items: NODE_REF },
    },
  };
}

/**
 * The JSON Schema of `spec.json`, with one node branch per block type of
 * `descriptors`, keyed on `type`, plus the sketch and `componentName` nodes.
 */
export function buildMockupSchema(
  descriptors: readonly BlockTypeDescriptor[],
): JsonObject {
  const sorted = [...descriptors].sort((left, right) =>
    left.type < right.type ? -1 : 1,
  );
  const branches = sorted.flatMap((descriptor) => {
    const options = blockOptions(descriptor);
    return options ? [blockNode(descriptor.type, options)] : [];
  });
  return {
    $schema: DRAFT,
    title: "DMS mockup spec",
    type: "object",
    required: ["version", "pages"],
    additionalProperties: false,
    properties: {
      $schema: { type: "string" },
      version: { const: 1 },
      title: { type: "string" },
      pages: {
        type: "array",
        minItems: 1,
        maxItems: MAX_PAGES,
        items: { $ref: "#/$defs/page" },
      },
    },
    $defs: {
      page: pageDefinition(),
      node: { oneOf: [...branches, SKETCH_NODE, COMPONENT_NODE] },
    },
  };
}
