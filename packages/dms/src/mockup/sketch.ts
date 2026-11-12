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
/** The inside of a tag up to a point, skipping quoted attribute values. */
const IN_TAG = String.raw`<(?:[^>"']|"[^"]*"|'[^']*')*?`;
const ATTRIBUTE_START = String.raw`(?<=[\s/"'])`;
/** The character references a style value may hold: the five HTML always escapes. */
const PLAIN_REFERENCES = new Map([
  ["quot", '"'],
  ["apos", "'"],
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
]);
/** A character reference other than the plain ones, which could spell CSS syntax unseen. */
const HIDDEN_REFERENCE = String.raw`&(?:#|(?!(?:quot|apos|amp|lt|gt);)[a-z])`;
const PLAIN_REFERENCE = /&(quot|apos|amp|lt|gt);/gi;
const URL_ATTRIBUTES =
  "src|srcset|href|xlink:href|poster|action|formaction|background|data|ping";

export const SKETCH_FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/<\s*script\b/i, "a <script> element"],
  [
    /<\s*(?:iframe|frame|frameset|object|embed|applet|portal|link|base)\b/i,
    "an embedding or linking element (iframe, object, embed, link, base)",
  ],
  [
    new RegExp(`<\\s*meta\\b${IN_TAG.slice(1)}http-equiv`, "i"),
    "a <meta http-equiv>",
  ],
  [
    new RegExp(`${IN_TAG}${ATTRIBUTE_START}on[a-z]+\\s*=`, "i"),
    "an on* event handler attribute",
  ],
  [/(?:java|vb)script\s*:/i, "a javascript: URL"],
  [
    new RegExp(
      `${IN_TAG}${ATTRIBUTE_START}style\\s*=\\s*(?:"[^"]*${HIDDEN_REFERENCE}|'[^']*${HIDDEN_REFERENCE}|[^\\s>"']*${HIDDEN_REFERENCE})`,
      "i",
    ),
    "a style attribute written with character references other than &quot; &apos; &amp; &lt; &gt; (&#40;)",
  ],
  [/@import\b/i, "a CSS @import"],
  [/url\(\s*(?!['"]?\s*data:)/i, "a url() that is not a data: URL"],
  [
    new RegExp(
      `${IN_TAG}${ATTRIBUTE_START}(?:${URL_ATTRIBUTES})\\s*=\\s*(?!['"]?\\s*(?:data:|#))`,
      "i",
    ),
    "a src, href or similar attribute that is not a data: URL or an #anchor",
  ],
];

/** What CSS may not hold beyond {@link SKETCH_FORBIDDEN}, read with its escapes decoded. */
const CSS_FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /['"]\s*(?:(?:https?|ftp|wss?|file):|\/\/)/i,
    "a quoted URL that is not a data: URL (in image(), image-set() or anywhere else)",
  ],
];

const CSS_ESCAPE = /\\([0-9a-f]{1,6})\s?|\\([^\n0-9a-f])/gi;
const MAX_CODE_POINT = 0x10ffff;
const REPLACEMENT_CHARACTER = "�";
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)(?:<\/style\s*>|$)/gi;
const STYLE_ATTRIBUTE =
  /[\s/"']style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** `css` with its escapes decoded, as a CSS parser reads it. */
function decodeCssEscapes(css: string): string {
  return css.replace(
    CSS_ESCAPE,
    (_, hex: string | undefined, char: string | undefined) => {
      if (hex === undefined) return char ?? "";
      const codePoint = Number.parseInt(hex, 16);
      return codePoint > 0 && codePoint <= MAX_CODE_POINT
        ? String.fromCodePoint(codePoint)
        : REPLACEMENT_CHARACTER;
    },
  );
}

/** The CSS an HTML sketch holds: its `<style>` elements and `style` attributes. */
function cssInHtml(html: string): string {
  const elements = [...html.matchAll(STYLE_ELEMENT)].map(
    (match) => match[1] ?? "",
  );
  const attributes = [...html.matchAll(STYLE_ATTRIBUTE)].map((match) =>
    (match[1] ?? match[2] ?? match[3] ?? "").replace(
      PLAIN_REFERENCE,
      (_, name: string) => PLAIN_REFERENCES.get(name.toLowerCase()) ?? "",
    ),
  );
  return [...elements, ...attributes].join("\n");
}

function matching(
  rules: ReadonlyArray<readonly [RegExp, string]>,
  texts: string[],
): string[] {
  return rules
    .filter(([pattern]) => texts.some((text) => pattern.test(text)))
    .map(([, what]) => what);
}

/** What `markup` holds that a sketch may not, its CSS read with escapes decoded. */
function forbiddenIn(markup: string, css: string): string[] {
  const decoded = decodeCssEscapes(css);
  return [
    ...matching(SKETCH_FORBIDDEN, [markup, decoded]),
    ...matching(CSS_FORBIDDEN, [decoded]),
  ];
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
  const refusals = [
    ...forbiddenIn(html, cssInHtml(html)).map((what) => ({
      field: "html",
      what,
    })),
    ...forbiddenIn(css ?? "", css ?? "").map((what) => ({
      field: "css",
      what,
    })),
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
  return placed(node, { type: SKETCH_TYPE, options });
}
