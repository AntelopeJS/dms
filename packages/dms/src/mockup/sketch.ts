import { z } from "zod";
import type { JsonObject, MockupIssue, MockupNode } from "./model";
import { zodIssues } from "./model";
import { cssRefusals } from "./sketch-css";
import { checkMarkup, type PageLink, staysInStyle } from "./sketch-html";
import {
  SKETCH_MAX_CAPTION,
  SKETCH_MAX_HEIGHT,
  SKETCH_MAX_SOURCE,
  SKETCH_MIN_HEIGHT,
} from "./sketch-limits";

/** The node type of a sketch: static HTML and CSS of a part the DMS lacks. */
export const SKETCH_TYPE = "sketch";

export const SKETCH_DEFAULT_HEIGHT = 320;
/** How tall a custom page's sketch is drawn when it sets no `height`. */
export const SKETCH_PAGE_DEFAULT_HEIGHT = 800;
export {
  SKETCH_MAX_CAPTION,
  SKETCH_MAX_HEIGHT,
  SKETCH_MAX_SOURCE,
  SKETCH_MIN_HEIGHT,
};

/** How many named states a sketch holds at most, beside its `html`. */
export const SKETCH_MAX_STATES = 8;
/** A state's name: a lowercase letter, then lowercase letters, digits and `-`, 32 characters at most. */
export const SKETCH_STATE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
/** The name a state may not take: the sketch's own `html` is its default state. */
export const SKETCH_DEFAULT_STATE = "default";

const stateNameSchema = z
  .string()
  .regex(
    SKETCH_STATE_PATTERN,
    "a state's name is a lowercase letter, then lowercase letters, digits and -, such as empty or error",
  )
  .refine((name) => name !== SKETCH_DEFAULT_STATE, {
    message: `"${SKETCH_DEFAULT_STATE}" is the sketch's own html: name the state otherwise`,
  });

/** The fields of a sketch: its markup, style sheet, height and named states, which a custom page holds too. */
const sketchFieldsSchema = z.object({
  html: z.string().max(SKETCH_MAX_SOURCE),
  css: z.string().max(SKETCH_MAX_SOURCE).optional(),
  height: z
    .number()
    .int()
    .min(SKETCH_MIN_HEIGHT)
    .max(SKETCH_MAX_HEIGHT)
    .optional(),
  states: z
    .record(stateNameSchema, z.string().max(SKETCH_MAX_SOURCE))
    .refine((states) => Object.keys(states).length <= SKETCH_MAX_STATES, {
      message: `a sketch holds at most ${SKETCH_MAX_STATES} states`,
    })
    .optional(),
});

const sketchOptionsSchema = sketchFieldsSchema
  .extend({ caption: z.string().max(SKETCH_MAX_CAPTION).optional() })
  .strict();

/** How a check reads a sketch's links. */
export interface SketchCheckOptions {
  /**
   * The URL an `<a href="page:<id>">` goes to, or undefined when `id` is no
   * page id, which refuses the sketch. The link is drawn with that URL and
   * `target="_top"`. Without it, an `<a>` links only to an `#anchor`.
   */
  pageLink?: PageLink;
}

/**
 * Where a mockup sketch's `page:<id>` links go: the URL of the link written
 * at the spec pointer `pointer`, or undefined when `id` is no page id.
 */
export type SketchLinks = (id: string, pointer: string) => string | undefined;

/** A sketch's source: the markup of its body and its style sheet. */
export interface SketchSource {
  html: string;
  css?: string;
}

/** One thing a sketch holds that it may not, and the field that holds it. */
export interface SketchRefusal {
  field: "html" | "css";
  what: string;
}

/**
 * A checked sketch: the sketch to draw, its markup written back from the tree
 * the check read, or what it holds that it may not.
 */
export type SketchCheck =
  | { ok: true; sketch: SketchSource }
  | { ok: false; refusals: SketchRefusal[] };

const UNREADABLE = "markup or CSS too large for the parser to read";

/** A sketch's source as a caller of the published subpath may hand it: checked to be strings before anything reads it. */
const SketchSourceSchema = z.object({
  html: z.string(),
  css: z.string().optional(),
});

/**
 * What `read` answers, or `unreadable` when it runs out of room: a string too
 * long for the engine or a stack too deep throws a `RangeError`, which a check
 * turns into a refusal rather than an exception. Any other error is a bug and
 * is thrown.
 */
function readable<T>(read: () => T, unreadable: T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof RangeError) return unreadable;
    throw error;
  }
}

/**
 * Checks a sketch the way the viewer's frame will read it. `html` is parsed
 * with an HTML parser as the frame's body, and every element and attribute of
 * the tree must be on the sketch allowlist; a URL may only be an `#anchor` or
 * a `data:image/` URL. The CSS of `css`, of `<style>` elements and of `style`
 * and SVG attributes is read with its escapes decoded. A sketch that passes is
 * answered with its markup written back from the parsed tree, which is what
 * the frame must draw. This module needs only `zod`, `parse5` and `@csstools/css-tokenizer`, so a process
 * without the AntelopeJS runtime can require it as `@antelopejs/dms/sketch`.
 * `html` and `css` each hold at most {@link SKETCH_MAX_SOURCE} characters, and
 * a field that is not a string, from a caller that skipped the types, is
 * refused rather than read.
 *
 * Draw only `checked.sketch`, never the source the check was given: the
 * viewer's `buildSketchDocument` draws the markup it is handed as is, so the
 * check holds only for the markup it answered.
 */
export function checkSketch(
  source: SketchSource,
  options: SketchCheckOptions = {},
): SketchCheck {
  const read = SketchSourceSchema.safeParse(source);
  if (!read.success) {
    const field = read.error.issues[0]?.path[0] === "css" ? "css" : "html";
    return {
      ok: false,
      refusals: [{ field, what: "a field that is not a string" }],
    };
  }
  const sketch = read.data;
  const oversized = (["html", "css"] as const).flatMap((field) =>
    (sketch[field]?.length ?? 0) > SKETCH_MAX_SOURCE
      ? [{ field, what: `more than ${SKETCH_MAX_SOURCE} characters` }]
      : [],
  );
  if (oversized.length > 0) return { ok: false, refusals: oversized };
  const markup = readable(() => checkMarkup(sketch.html, options.pageLink), {
    refusals: [UNREADABLE],
    body: "",
  });
  const { css } = sketch;
  const cssFound =
    css === undefined
      ? []
      : readable(
          () => [
            ...(staysInStyle(css)
              ? []
              : ["markup such as </style> that ends the style element"]),
            ...cssRefusals(css),
          ],
          [UNREADABLE],
        );
  const refusals: SketchRefusal[] = [
    ...markup.refusals.map((what) => ({ field: "html" as const, what })),
    ...cssFound.map((what) => ({ field: "css" as const, what })),
  ];
  if (refusals.length > 0) return { ok: false, refusals };
  return {
    ok: true,
    sketch:
      sketch.css === undefined
        ? { html: markup.body }
        : { html: markup.body, css: sketch.css },
  };
}

/**
 * What a sketch holds that it may not, as {@link checkSketch} finds it: empty
 * when it may be drawn. An empty list does not make the source safe to draw:
 * draw the sketch {@link checkSketch} answers.
 */
export function sketchRefusals(sketch: SketchSource): string[] {
  const checked = checkSketch(sketch);
  return checked.ok ? [] : checked.refusals.map(({ what }) => what);
}

/** `sketch` where `node` sat: its id, slot and span, which its layout path and its parent read. */
function placed(node: MockupNode, sketch: MockupNode): MockupNode {
  const result: MockupNode = { ...sketch };
  if (node.id !== undefined) result.id = node.id;
  if (node.slot !== undefined) result.slot = node.slot;
  if (node.colSpan !== undefined) result.colSpan = node.colSpan;
  return result;
}

/** Where a sketch's fields are compiled: the spec pointer of the object holding them, its issues and its links. */
interface SketchSite {
  at: string;
  issues: MockupIssue[];
  links: SketchLinks;
}

/**
 * The sketch to draw for `source`, whose markup is the field at `htmlAt`, or
 * an empty one when the check refuses it, each refusal reported at its field.
 */
function drawnAt(
  source: SketchSource,
  htmlAt: string,
  site: SketchSite,
): SketchSource {
  const checked = checkSketch(source, {
    pageLink: (id) => site.links(id, htmlAt),
  });
  if (checked.ok) return checked.sketch;
  for (const { field, what } of checked.refusals) {
    site.issues.push({
      path: field === "html" ? htmlAt : `${site.at}/css`,
      message: `a sketch is static HTML and CSS, so it may not hold ${what}`,
    });
  }
  return { html: "" };
}

/**
 * The options the viewer draws a sketch with, from its written fields at
 * `site.at`: its markup and each named state checked as the frame reads them,
 * the style sheet once, with the markup, and the page links rewritten. A
 * refused markup or state is emitted empty, so none of it reaches the frame.
 */
function compileSketchFields(
  fields: z.infer<typeof sketchOptionsSchema>,
  site: SketchSite,
): JsonObject {
  const { html, css, height, caption, states } = fields;
  const drawn = drawnAt(
    css === undefined ? { html } : { html, css },
    `${site.at}/html`,
    site,
  );
  const options: JsonObject = {
    html: drawn.html,
    height: height ?? SKETCH_DEFAULT_HEIGHT,
  };
  if (drawn.css !== undefined) options.css = drawn.css;
  if (caption !== undefined) options.caption = caption;
  if (states !== undefined) {
    options.states = Object.fromEntries(
      Object.entries(states).map(([name, markup]) => [
        name,
        drawnAt({ html: markup }, `${site.at}/states/${name}`, site).html,
      ]),
    );
  }
  return options;
}

/**
 * The sketch a custom page is drawn as, from its sketch fields, written on
 * the page at `at`: the page's whole tree, which no spec node holds.
 */
export function compileSketchPage(
  fields: JsonObject,
  at: string,
  issues: MockupIssue[],
  links: SketchLinks,
): MockupNode {
  const parsed = sketchFieldsSchema.strict().safeParse(fields);
  if (!parsed.success) {
    issues.push(...zodIssues(at, parsed.error));
    return { type: SKETCH_TYPE, options: { html: "" } };
  }
  const options = compileSketchFields(
    {
      ...parsed.data,
      height: parsed.data.height ?? SKETCH_PAGE_DEFAULT_HEIGHT,
    },
    { at, issues, links },
  );
  return { type: SKETCH_TYPE, options };
}

/**
 * The sketch the viewer draws for `node`, with its issues. A sketch holding
 * forbidden markup is refused: it is emitted empty, so none of it reaches the
 * frame. Its `page:<id>` links go where `links` says.
 */
export function compileSketch(
  node: MockupNode,
  pointer: string,
  issues: MockupIssue[],
  links: SketchLinks,
): MockupNode {
  if (node.children?.length) {
    issues.push({
      path: `${pointer}/children`,
      message: "a sketch has no children",
    });
  }
  const at = `${pointer}/options`;
  const parsed = sketchOptionsSchema.safeParse(node.options ?? {});
  if (!parsed.success) {
    issues.push(...zodIssues(at, parsed.error));
    return placed(node, { type: SKETCH_TYPE, options: { html: "" } });
  }
  const options = compileSketchFields(parsed.data, { at, issues, links });
  return placed(node, { type: SKETCH_TYPE, options });
}
