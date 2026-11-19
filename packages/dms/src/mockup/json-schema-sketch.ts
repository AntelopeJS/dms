import type { JsonObject } from "./model";
import {
  SKETCH_DEFAULT_STATE,
  SKETCH_MAX_CAPTION,
  SKETCH_MAX_HEIGHT,
  SKETCH_MAX_SOURCE,
  SKETCH_MAX_STATES,
  SKETCH_MIN_HEIGHT,
  SKETCH_PAGE_DEFAULT_HEIGHT,
  SKETCH_STATE_PATTERN,
} from "./sketch";
import { SIDEBAR_WIDGET_MAX_HEIGHT } from "./sketch-limits";
import {
  MAX_SIDEBAR_WIDGETS,
  SIDEBAR_WIDGET_DEFAULT_HEIGHT,
  SLUG_PATTERN,
} from "./model";

/** A sketch's named states, as a sketch node and a custom page write them. */
export const SKETCH_STATES: JsonObject = {
  type: "object",
  maxProperties: SKETCH_MAX_STATES,
  propertyNames: {
    pattern: SKETCH_STATE_PATTERN.source,
    not: { const: SKETCH_DEFAULT_STATE },
  },
  additionalProperties: { type: "string", maxLength: SKETCH_MAX_SOURCE },
  description:
    "Named states drawn in place of html, such as empty, error or loading: each its own markup, checked as html is, drawn with the same css.",
};

/** What a custom page holds, which a page of blocks has none of. */
export const CUSTOM_PAGE_PROPERTIES: JsonObject = {
  custom: {
    type: "boolean",
    description:
      "true: the page is one sketch, drawn whole inside the real page header and sidebar, from html, css, height and states. Its tree is left out or empty. The build draws it as a tree of DMS blocks, with a CustomComponent only for a part no block can draw.",
  },
  html: {
    type: "string",
    maxLength: SKETCH_MAX_SOURCE,
    description:
      "A custom page's markup, checked as a sketch's html. An <a> links to an #anchor, or to a spec page with href=\"page:<id>\".",
  },
  css: { type: "string", maxLength: SKETCH_MAX_SOURCE },
  height: {
    type: "integer",
    minimum: SKETCH_MIN_HEIGHT,
    maximum: SKETCH_MAX_HEIGHT,
    default: SKETCH_PAGE_DEFAULT_HEIGHT,
    description: "A custom page's frame height, in pixels.",
  },
  states: SKETCH_STATES,
};

/**
 * A custom page writes `custom: true` and its `html`, and no block in
 * `tree`; any other page writes its `tree` and no sketch field.
 */
export const CUSTOM_PAGE_RULE: JsonObject = {
  anyOf: [
    {
      required: ["custom", "html"],
      properties: { custom: { const: true }, tree: { maxItems: 0 } },
    },
    {
      required: ["tree"],
      properties: {
        custom: { const: false },
        html: false,
        css: false,
        height: false,
        states: false,
      },
    },
  ],
};

/** The `sidebar` of a spec: the widget sketches it adds to the dashboard's sidebar. */
export const SIDEBAR_SCHEMA: JsonObject = {
  type: "object",
  required: ["widgets"],
  additionalProperties: false,
  description:
    "What the mockup adds to the dashboard's sidebar, drawn in every page of the mockup.",
  properties: {
    widgets: {
      type: "array",
      maxItems: MAX_SIDEBAR_WIDGETS,
      description:
        "Sketches drawn in the sidebar's widget area, below the dashboard's own widgets, in order. Each follows the sketch rules: static HTML and CSS, drawn in a sandboxed frame.",
      items: {
        type: "object",
        required: ["id", "html"],
        additionalProperties: false,
        properties: {
          id: {
            type: "string",
            pattern: SLUG_PATTERN.source,
            description: "Unique among the sidebar's widgets.",
          },
          title: {
            type: "string",
            maxLength: SKETCH_MAX_CAPTION,
            description: "The caption over the widget.",
          },
          html: { type: "string", maxLength: SKETCH_MAX_SOURCE },
          css: { type: "string", maxLength: SKETCH_MAX_SOURCE },
          height: {
            type: "integer",
            minimum: SKETCH_MIN_HEIGHT,
            maximum: SIDEBAR_WIDGET_MAX_HEIGHT,
            default: SIDEBAR_WIDGET_DEFAULT_HEIGHT,
          },
        },
      },
    },
  },
};
