import type {
  BlockOptionSchema,
  BlockTypeDescriptor,
} from "@antelopejs/interface-dms/base/block-types";
import { ButtonVariant } from "@antelopejs/interface-dms/base/types/button";
import { TONES } from "@antelopejs/interface-dms/base/types/tone";
import { CONTROLLER_BLOCKS } from "./controller-blocks";
import { DATA_SCHEMA } from "./data-access";
import {
  DEFAULT_GENERATED_ROWS,
  GENERATE_KEY,
  GENERATE_KINDS,
  MAX_GENERATED_ROWS,
} from "./generate";
import type { Json, JsonObject } from "./model";
import {
  jsonSchema,
  KEY_PATTERN,
  LIVE_ROUTE_PATTERN,
  MAX_PAGES,
  MAX_RELATIVE_ROUTE,
  MOCKUP_SOURCES,
  RELATIVE_ROUTE_PATTERN,
  ROUTE_PARAM_PATTERN,
  SLUG_PATTERN,
} from "./model";
import {
  SKETCH_DEFAULT_HEIGHT,
  SKETCH_MAX_CAPTION,
  SKETCH_MAX_HEIGHT,
  SKETCH_MAX_SOURCE,
  SKETCH_MIN_HEIGHT,
  SKETCH_TYPE,
} from "./sketch";
import {
  CUSTOM_PAGE_PROPERTIES,
  CUSTOM_PAGE_RULE,
  SKETCH_STATES,
  SIDEBAR_SCHEMA,
} from "./json-schema-sketch";
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
        html: {
          type: "string",
          maxLength: SKETCH_MAX_SOURCE,
          description:
            'Static markup, no script or handler. An <a> links to an #anchor, or to a spec page with href="page:<id>".',
        },
        css: { type: "string", maxLength: SKETCH_MAX_SOURCE },
        height: {
          type: "integer",
          minimum: SKETCH_MIN_HEIGHT,
          maximum: SKETCH_MAX_HEIGHT,
          default: SKETCH_DEFAULT_HEIGHT,
        },
        caption: { type: "string", maxLength: SKETCH_MAX_CAPTION },
        states: SKETCH_STATES,
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

const HEADER_ACTION: JsonObject = {
  type: "object",
  required: ["label"],
  additionalProperties: false,
  description:
    "A button right of the page title, as a PageHeaderButton of DefaultLayout({ headerActions }) looks. What it does is code, so the mockup holds none.",
  properties: {
    label: { type: "string" },
    icon: { type: "string", description: "An icon name, e.g. i-ph-plus." },
    color: { enum: [...TONES] },
    variant: { enum: Object.values(ButtonVariant) },
  },
};

const RANGE: JsonObject = {
  type: "array",
  prefixItems: [{ type: "number" }, { type: "number" }],
  minItems: 2,
  maxItems: 2,
  description: "[min, max], the minimum not above the maximum.",
};

function rangeKind(key: string, description: string): JsonObject {
  return {
    type: "object",
    required: [key],
    additionalProperties: false,
    description,
    properties: { [key]: RANGE },
  };
}

function generateDefinition(): JsonObject {
  return {
    type: "object",
    required: [GENERATE_KEY],
    additionalProperties: false,
    description:
      "Rows the server makes up, the same on every read of the spec: they are seeded by the mockup, the page and the fixture key. Read as an array of row objects, by a table's `fixture:<key>` as by any other block.",
    properties: {
      [GENERATE_KEY]: {
        type: "object",
        required: ["fields"],
        additionalProperties: false,
        properties: {
          rows: {
            type: "integer",
            minimum: 1,
            maximum: MAX_GENERATED_ROWS,
            default: DEFAULT_GENERATED_ROWS,
            description: "How many rows.",
          },
          fields: {
            type: "object",
            minProperties: 1,
            description: "The value of each row field, by its kind.",
            additionalProperties: {
              anyOf: [
                {
                  enum: [...GENERATE_KINDS],
                  description:
                    '"id" is a unique text id (r1, r2...); "name", "email" (of the same row\'s person), "company", "city", "text" (a short sentence) and "date" (an ISO 8601 date and time within the last 30 days) are realistic text; "boolean" is true or false.',
                },
                rangeKind(
                  "number",
                  "A number in the range: an integer when both bounds are.",
                ),
                rangeKind("money", "An amount in the range, to the cent."),
                {
                  type: "array",
                  items: { type: "string" },
                  minItems: 1,
                  description: "One of these values for each row.",
                },
              ],
            },
          },
        },
      },
    },
  };
}

function pageDefinition(): JsonObject {
  return {
    type: "object",
    required: ["id", "title"],
    additionalProperties: false,
    ...CUSTOM_PAGE_RULE,
    properties: {
      ...CUSTOM_PAGE_PROPERTIES,
      id: { type: "string", pattern: SLUG_PATTERN.source },
      title: {
        type: "string",
        description:
          "The page's display name, drawn as the title of the page header.",
      },
      category: {
        type: "string",
        description:
          'The id of the categories entry the page is listed under in the sidebar. Left out, the page is in the default "Pages" section.',
      },
      menu: {
        type: "boolean",
        default: true,
        description:
          "false leaves the page out of the sidebar, as a detail or form page the dashboard opens from another page: the viewer still lists it, marked hidden.",
      },
      parent: {
        type: "string",
        pattern: SLUG_PATTERN.source,
        description:
          "The id of the page this one is a sub-page of, such as a list's detail page. Its blocks read the fixtures of its parents that it does not hold itself.",
      },
      route: {
        type: "string",
        pattern: ROUTE_PARAM_PATTERN.source,
        description:
          'A route parameter, ":id": the page shows one row. An option "fixture:<key>" naming a parent\'s rows reads the row whose _id, else id, is the parameter, and a "page:<id>" link from a table row passes that row\'s id. Needs a parent.',
      },
      icon: {
        type: "string",
        description:
          "The page's icon (MenuOptions.icon), drawn in the badge of the page header, e.g. i-ph-shopping-cart.",
      },
      description: {
        type: "string",
        description:
          "The page's description (MenuOptions.description), drawn under the title in the page header.",
      },
      headerActions: {
        type: "array",
        items: HEADER_ACTION,
        description:
          "The buttons right of the title, in order, as DefaultLayout({ headerActions }) declares them.",
      },
      options: {
        type: "object",
        additionalProperties: false,
        properties: {
          theme: { enum: ["light", "dark"] },
          locale: { type: "string" },
          padding: { type: "boolean", default: true },
        },
      },
      livePage: {
        type: "object",
        required: ["ref", "version"],
        additionalProperties: false,
        description:
          "The live page this page was converted from (mockup_from_page) or built into, and its version then. Build it updates that page instead of creating a new one.",
        properties: {
          ref: {
            type: "string",
            minLength: 1,
            description: "Its builder ref.",
          },
          version: {
            type: "string",
            description: "Its source file's version at the conversion.",
          },
        },
      },
      liveRoutes: {
        type: "object",
        propertyNames: { pattern: KEY_PATTERN.source },
        additionalProperties: {
          type: "string",
          pattern: LIVE_ROUTE_PATTERN.source,
          maxLength: MAX_RELATIVE_ROUTE,
        },
        description:
          'The live route a fixture key stands for: with Real data on, an option "fixture:<key>" reads it instead of the fixture.',
      },
      fixtures: {
        type: "object",
        propertyNames: { pattern: KEY_PATTERN.source },
        additionalProperties: {
          anyOf: [
            { $ref: "#/$defs/generate" },
            { not: { type: "object", required: [GENERATE_KEY] } },
          ],
        },
        description:
          'Data a block reads: an option "fixture:<key>" is served from here. A value { "$generate": { "rows", "fields" } } is replaced by generated rows.',
      },
      tree: {
        type: "array",
        items: NODE_REF,
        description:
          "The blocks, top to bottom. A string option \"page:<id>\", at any depth, links to the spec page of that id: a block's link, a button's or a row action's target URL, a tab's link.",
      },
    },
  };
}

function builtDefinition(): JsonObject {
  return {
    type: "object",
    required: ["at", "pages"],
    additionalProperties: false,
    description:
      "Written when the mockup is built into real pages. Leave it out while the mockup is a draft: the Mockups page lists a mockup with it as Built and links each page. Also set each built page's livePage to the page it was built into, with the version the builder answered after the build: the Mockups page marks the mockup Out of sync once that page's version moves on.",
    properties: {
      at: {
        type: "string",
        format: "date-time",
        description:
          "When the build finished, an ISO 8601 date and time, e.g. 2026-11-13T10:00:00Z.",
      },
      pages: {
        type: "array",
        minItems: 1,
        maxItems: MAX_PAGES,
        items: {
          type: "object",
          required: ["path"],
          additionalProperties: false,
          properties: {
            path: {
              type: "string",
              pattern: RELATIVE_ROUTE_PATTERN.source,
              maxLength: MAX_RELATIVE_ROUTE,
              description:
                'A path of the dashboard, such as "/orders": it starts with one "/", never "//" or "/\\", and holds no whitespace or control character.',
            },
            title: {
              type: "string",
              description:
                "The link's text. The path is shown when it is absent.",
            },
          },
        },
      },
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
      source: {
        enum: [...MOCKUP_SOURCES],
        description:
          "Who wrote this mockup: chat (the dashboard chat), claude-code or codex. Set it when you create the spec.",
      },
      built: builtDefinition(),
      data: DATA_SCHEMA,
      categories: {
        type: "array",
        maxItems: MAX_PAGES,
        description:
          "The sections of the sidebar, in the menu's order, as categories of the dashboard's menu (RootCategory). A page names one in its category.",
        items: {
          type: "object",
          required: ["id", "title"],
          additionalProperties: false,
          properties: {
            id: { type: "string", pattern: SLUG_PATTERN.source },
            title: { type: "string" },
            icon: {
              type: "string",
              description: "An icon name, e.g. i-ph-shopping-cart.",
            },
          },
        },
      },
      sidebar: SIDEBAR_SCHEMA,
      pages: {
        type: "array",
        maxItems: MAX_PAGES,
        description:
          "May be empty: create the mockup first and add its pages later.",
        items: { $ref: "#/$defs/page" },
      },
    },
    $defs: {
      page: pageDefinition(),
      generate: generateDefinition(),
      node: { oneOf: [...branches, SKETCH_NODE, COMPONENT_NODE] },
    },
  };
}
