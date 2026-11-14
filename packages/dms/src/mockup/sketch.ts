import { z } from "zod";
import type { JsonObject, MockupIssue, MockupNode } from "./model";
import { zodIssues } from "./model";
import { cssRefusals } from "./sketch-css";
import { checkMarkup, staysInStyle } from "./sketch-html";

/** The node type of a sketch: static HTML and CSS of a part the DMS lacks. */
export const SKETCH_TYPE = "sketch";

export const SKETCH_MIN_HEIGHT = 80;
export const SKETCH_MAX_HEIGHT = 1200;
export const SKETCH_DEFAULT_HEIGHT = 320;
export const SKETCH_MAX_CAPTION = 200;
/** The most characters a sketch's `html` or `css` may hold, room for inline `data:` images. */
export const SKETCH_MAX_SOURCE = 512 * 1024;

const sketchOptionsSchema = z
  .object({
    html: z.string().max(SKETCH_MAX_SOURCE),
    css: z.string().max(SKETCH_MAX_SOURCE).optional(),
    height: z
      .number()
      .int()
      .min(SKETCH_MIN_HEIGHT)
      .max(SKETCH_MAX_HEIGHT)
      .optional(),
    caption: z.string().max(SKETCH_MAX_CAPTION).optional(),
  })
  .strict();

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

/**
 * Checks a sketch the way the viewer's frame will read it. `html` is parsed
 * with an HTML parser as the frame's body, and every element and attribute of
 * the tree must be on the sketch allowlist; a URL may only be an `#anchor` or
 * a `data:image/` URL. The CSS of `css`, of `<style>` elements and of `style`
 * and SVG attributes is read with its escapes decoded. A sketch that passes is
 * answered with its markup written back from the parsed tree, which is what
 * the frame must draw. This module needs only `zod` and `parse5`, so a process
 * without the AntelopeJS runtime can require it as `@antelopejs/dms/sketch`.
 *
 * Draw only `checked.sketch`, never the source the check was given: the
 * viewer's `buildSketchDocument` draws the markup it is handed as is, so the
 * check holds only for the markup it answered.
 */
export function checkSketch(sketch: SketchSource): SketchCheck {
  const markup = checkMarkup(sketch.html);
  const css =
    sketch.css === undefined
      ? []
      : [
          ...(staysInStyle(sketch.css)
            ? []
            : ["markup such as </style> that ends the style element"]),
          ...cssRefusals(sketch.css),
        ];
  const refusals: SketchRefusal[] = [
    ...markup.refusals.map((what) => ({ field: "html" as const, what })),
    ...css.map((what) => ({ field: "css" as const, what })),
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

/**
 * The sketch the viewer draws for `node`, with its issues. A sketch holding
 * forbidden markup is refused: it is emitted empty, so none of it reaches the
 * frame.
 */
export function compileSketch(
  node: MockupNode,
  pointer: string,
  issues: MockupIssue[],
): MockupNode {
  if (node.children?.length) {
    issues.push({
      path: `${pointer}/children`,
      message: "a sketch has no children",
    });
  }
  const parsed = sketchOptionsSchema.safeParse(node.options ?? {});
  if (!parsed.success) {
    issues.push(...zodIssues(`${pointer}/options`, parsed.error));
    return placed(node, { type: SKETCH_TYPE, options: { html: "" } });
  }
  const { html, css, height, caption } = parsed.data;
  const checked = checkSketch(css === undefined ? { html } : { html, css });
  if (!checked.ok) {
    for (const { field, what } of checked.refusals) {
      issues.push({
        path: `${pointer}/options/${field}`,
        message: `a sketch is static HTML and CSS, so it may not hold ${what}`,
      });
    }
  }
  const drawn = checked.ok ? checked.sketch : { html: "" };
  const options: JsonObject = {
    html: drawn.html,
    height: height ?? SKETCH_DEFAULT_HEIGHT,
  };
  if (drawn.css !== undefined) options.css = drawn.css;
  if (caption !== undefined) options.caption = caption;
  return placed(node, { type: SKETCH_TYPE, options });
}
