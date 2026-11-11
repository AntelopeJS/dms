import { z } from "zod";
import type { JsonObject, MockupIssue, MockupNode } from "./model";
import { zodIssues } from "./model";

/** The node type of a sketch: static HTML and CSS of a part the DMS lacks. */
export const SKETCH_TYPE = "sketch";

export const SKETCH_MIN_HEIGHT = 80;
export const SKETCH_MAX_HEIGHT = 1200;
export const SKETCH_DEFAULT_HEIGHT = 320;
export const SKETCH_MAX_CAPTION = 200;

const sketchOptionsSchema = z
  .object({
    html: z.string(),
    css: z.string().optional(),
    height: z
      .number()
      .int()
      .min(SKETCH_MIN_HEIGHT)
      .max(SKETCH_MAX_HEIGHT)
      .optional(),
    caption: z.string().max(SKETCH_MAX_CAPTION).optional(),
  })
  .strict();

/**
 * Markup a sketch may not hold, as dms-ai's `PREVIEW_SKETCH_FORBIDDEN` lists
 * it. The frame the viewer draws a sketch in runs no script and loads nothing
 * but `data:` URLs; these checks turn a sketch that would break there into an
 * issue instead.
 */
export const SKETCH_FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/<\s*script\b/i, "a <script> element"],
  [
    /<\s*(?:iframe|frame|frameset|object|embed|applet|portal|link|base)\b/i,
    "an embedding or linking element (iframe, object, embed, link, base)",
  ],
  [/<\s*meta\b[^>]*http-equiv/i, "a <meta http-equiv>"],
  [/<[^>]*[\s/"']on[a-z]+\s*=/i, "an on* event handler attribute"],
  [/(?:java|vb)script\s*:/i, "a javascript: URL"],
  [/@import\b/i, "a CSS @import"],
  [/url\(\s*(?!['"]?\s*data:)/i, "a url() that is not a data: URL"],
  [
    /<[^>]*\s(?:src|srcset|href|xlink:href|poster|action|formaction|background|data|ping)\s*=\s*(?!['"]?\s*(?:data:|#))/i,
    "a src, href or similar attribute that is not a data: URL or an #anchor",
  ],
];

function forbiddenIn(markup: string): string[] {
  return SKETCH_FORBIDDEN.filter(([pattern]) => pattern.test(markup)).map(
    ([, what]) => what,
  );
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
    return { type: SKETCH_TYPE, options: { html: "" } };
  }
  const { html, css, height, caption } = parsed.data;
  const refusals = [
    ...forbiddenIn(html).map((what) => ({ field: "html", what })),
    ...forbiddenIn(css ?? "").map((what) => ({ field: "css", what })),
  ];
  for (const { field, what } of refusals) {
    issues.push({
      path: `${pointer}/options/${field}`,
      message: `a sketch is static HTML and CSS, so it may not hold ${what}`,
    });
  }
  const options: JsonObject = {
    html: refusals.length ? "" : html,
    height: height ?? SKETCH_DEFAULT_HEIGHT,
  };
  if (css !== undefined && !refusals.length) options.css = css;
  if (caption !== undefined) options.caption = caption;
  return { type: SKETCH_TYPE, options };
}
