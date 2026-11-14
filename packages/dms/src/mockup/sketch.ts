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
 * One token of a tag read as if every quote opened a value: a character, or a
 * quoted value. Matched from `lastIndex`, it fails at the `>` that ends the tag
 * and at a quote nothing closes.
 */
const QUOTED_TAG_TOKEN = /[^>"']|"[^"]*"|'[^']*'/y;
/**
 * One token of a tag read as HTML does: a quote opens a value only right
 * after `=`, and an unquoted value runs to whitespace or `>`.
 */
const HTML_TAG_TOKEN =
  /[^>=]|=\s*"[^"]*"|=\s*'[^']*'|=\s*[^\s>"'][^\s>]*|=(?=\s*(?:>|$))/y;
/** Both readings of a tag. A stray quote hides an attribute from one of them, never from both. */
const TAG_READINGS = [QUOTED_TAG_TOKEN, HTML_TAG_TOKEN];
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
/** Every named character reference that stands for ASCII, keyed by its name in lower case. */
const ASCII_REFERENCES = new Map([
  ...PLAIN_REFERENCES,
  ["tab", "\t"],
  ["newline", "\n"],
  ["excl", "!"],
  ["num", "#"],
  ["dollar", "$"],
  ["percnt", "%"],
  ["lpar", "("],
  ["rpar", ")"],
  ["ast", "*"],
  ["midast", "*"],
  ["plus", "+"],
  ["comma", ","],
  ["period", "."],
  ["sol", "/"],
  ["colon", ":"],
  ["semi", ";"],
  ["equals", "="],
  ["quest", "?"],
  ["commat", "@"],
  ["lsqb", "["],
  ["lbrack", "["],
  ["bsol", "\\"],
  ["rsqb", "]"],
  ["rbrack", "]"],
  ["hat", "^"],
  ["lowbar", "_"],
  ["underbar", "_"],
  ["grave", "`"],
  ["diacriticalgrave", "`"],
  ["lcub", "{"],
  ["lbrace", "{"],
  ["verbar", "|"],
  ["vert", "|"],
  ["verticalline", "|"],
  ["rcub", "}"],
  ["rbrace", "}"],
  ["fjlig", "fj"],
]);
/** A numeric reference, a named one closed by `;`, or one HTML reads without its `;`. */
const REFERENCE =
  /&(?:#x([0-9a-f]+);?|#([0-9]+);?|([a-z][a-z0-9]*);|(quot|amp|lt|gt))/gi;
const URL_ATTRIBUTES =
  "src|srcset|href|xlink:href|poster|action|formaction|background|data|ping";

/** A test a text fails, and what the sketch then holds. */
type Rule = readonly [(text: string) => boolean, string];

function pattern(regExp: RegExp): (text: string) => boolean {
  return (text) => regExp.test(text);
}

function svgStyle(text: string): boolean {
  const foreign = text.search(/<\s*(?:svg|math)\b/i);
  return foreign !== -1 && /<\s*style\b/i.test(text.slice(foreign));
}

/**
 * Markup a sketch may not hold. The frame the viewer draws a sketch in runs no
 * script and loads nothing but `data:` URLs, but it can still navigate, so a
 * link out is refused here or nowhere.
 */
const MARKUP_FORBIDDEN: ReadonlyArray<Rule> = [
  [pattern(/<\s*script\b/i), "a <script> element"],
  [
    pattern(
      /<\s*(?:iframe|frame|frameset|object|embed|applet|portal|link|base)\b/i,
    ),
    "an embedding or linking element (iframe, object, embed, link, base)",
  ],
  [
    pattern(/<\s*(?:set|animate[a-z]*)\b/i),
    "an SVG animation element (set, animate), which can set a link",
  ],
  [
    svgStyle,
    "a <style> element after an <svg> or <math> element, where its text is read as markup (put <style> first)",
  ],
  [pattern(/(?:java|vb)script\s*:/i), "a javascript: URL"],
  [pattern(/@import\b/i), "a CSS @import"],
  [pattern(/url\(\s*(?!['"]?\s*data:)/i), "a url() that is not a data: URL"],
];

/** Attributes a tag may not hold, each matched at a point the tag's tokens reach. */
const ATTRIBUTE_FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [
    new RegExp(String.raw`${ATTRIBUTE_START}http-equiv`, "iy"),
    "a <meta http-equiv>",
  ],
  [
    new RegExp(String.raw`${ATTRIBUTE_START}on[a-z]+\s*=`, "iy"),
    "an on* event handler attribute",
  ],
  [
    new RegExp(
      String.raw`${ATTRIBUTE_START}style\s*=\s*(?:"[^"]*${HIDDEN_REFERENCE}|'[^']*${HIDDEN_REFERENCE}|[^\s>"']*${HIDDEN_REFERENCE})`,
      "iy",
    ),
    "a style attribute written with character references other than &quot; &apos; &amp; &lt; &gt; (&#40;)",
  ],
  [
    new RegExp(
      String.raw`${ATTRIBUTE_START}(?:${URL_ATTRIBUTES})\s*=\s*(?!['"]?\s*(?:data:|#))`,
      "iy",
    ),
    "a src, href or similar attribute that is not a data: URL or an #anchor",
  ],
];

const IMAGE_FUNCTION = String.raw`(?:image-set|image|cross-fade|src)\(`;
/** A data URL a quoted image argument may hold: no quote, space or parenthesis to end it early. */
const DATA_STRING = String.raw`"\s*data:[\w+/=:;,.%-]*"|'\s*data:[\w+/=:;,.%-]*'`;
/** An image function whose arguments are only `data:` strings, words such as `2x`, and commas. */
const DATA_IMAGE_FUNCTION = new RegExp(
  String.raw`${IMAGE_FUNCTION}(?:${DATA_STRING}|[\w.%+,\s-])*\)`,
  "gi",
);
const ANY_IMAGE_FUNCTION = new RegExp(IMAGE_FUNCTION, "i");

/** What CSS may not hold beyond {@link MARKUP_FORBIDDEN}, read with its escapes decoded. */
const CSS_FORBIDDEN: ReadonlyArray<Rule> = [
  [
    pattern(/['"]\s*(?:(?:https?|ftp|wss?|file):|\/\/)/i),
    "a quoted URL that is not a data: URL (in image(), image-set() or anywhere else)",
  ],
  [
    (css) => ANY_IMAGE_FUNCTION.test(css.replace(DATA_IMAGE_FUNCTION, "")),
    "an image(), image-set(), cross-fade() or src() holding anything but data: strings (a relative URL loads from the dashboard)",
  ],
];

/** CSS's newlines, which its parser reads as one `\n`. */
const CSS_NEWLINE = /\r\n?|\f/g;
const CSS_ESCAPE = /\\([0-9a-f]{1,6})[ \t\n]?|\\\n|\\([^\n0-9a-f])/gi;
const MAX_CODE_POINT = 0x10ffff;
const REPLACEMENT_CHARACTER = "�";
const STYLE_START = /<style\b/gi;
const STYLE_END = /<\/style\s*>/gi;
const STYLE_ATTRIBUTE =
  /[\s/"']style\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

function fromCodePoint(codePoint: number): string {
  return codePoint > 0 && codePoint <= MAX_CODE_POINT
    ? String.fromCodePoint(codePoint)
    : REPLACEMENT_CHARACTER;
}

/** `css` with its escapes decoded and a backslash before a newline dropped, as a CSS parser reads it. */
function decodeCssEscapes(css: string): string {
  return css
    .replace(CSS_NEWLINE, "\n")
    .replace(
      CSS_ESCAPE,
      (_, hex: string | undefined, char: string | undefined) =>
        hex === undefined
          ? (char ?? "")
          : fromCodePoint(Number.parseInt(hex, 16)),
    );
}

/** `html` with its numeric references and the named ones that stand for ASCII decoded. */
function decodeReferences(html: string): string {
  return html.replace(
    REFERENCE,
    (
      reference: string,
      hex: string | undefined,
      decimal: string | undefined,
      name: string | undefined,
      legacy: string | undefined,
    ) => {
      if (hex !== undefined) return fromCodePoint(Number.parseInt(hex, 16));
      if (decimal !== undefined)
        return fromCodePoint(Number.parseInt(decimal, 10));
      return (
        ASCII_REFERENCES.get((name ?? legacy ?? "").toLowerCase()) ?? reference
      );
    },
  );
}

/** The text of each `<style>` element of `html`, an unclosed one running to the end. */
function styleElements(html: string): string[] {
  const contents: string[] = [];
  STYLE_START.lastIndex = 0;
  while (STYLE_START.exec(html) !== null) {
    const tagEnd = html.indexOf(">", STYLE_START.lastIndex);
    if (tagEnd === -1) break;
    STYLE_END.lastIndex = tagEnd + 1;
    const close = STYLE_END.exec(html);
    contents.push(html.slice(tagEnd + 1, close?.index ?? html.length));
    if (close === null) break;
    STYLE_START.lastIndex = STYLE_END.lastIndex;
  }
  return contents;
}

/** The CSS an HTML sketch holds: its `<style>` elements and `style` attributes. */
function cssInHtml(html: string): string {
  const attributes = [...html.matchAll(STYLE_ATTRIBUTE)].map((match) =>
    (match[1] ?? match[2] ?? match[3] ?? "").replace(
      PLAIN_REFERENCE,
      (_, name: string) => PLAIN_REFERENCES.get(name.toLowerCase()) ?? "",
    ),
  );
  return [...styleElements(html), ...attributes].join("\n");
}

function attributesAt(text: string, at: number): string[] {
  return ATTRIBUTE_FORBIDDEN.filter(([attribute]) => {
    attribute.lastIndex = at;
    return attribute.test(text);
  }).map(([, what]) => what);
}

/**
 * What the attributes of the tags in `text` hold that a sketch may not, each
 * tag read by `token` from every `<`. A point another `<` already reached is
 * read the same from there on, so each is checked once and the walk stays
 * linear.
 */
function attributeRefusals(text: string, token: RegExp): string[] {
  const found = new Set<string>();
  const reached = new Uint8Array(text.length + 1);
  for (
    let start = text.indexOf("<");
    start !== -1;
    start = text.indexOf("<", start + 1)
  ) {
    let at = start + 1;
    while (reached[at] === 0) {
      reached[at] = 1;
      for (const what of attributesAt(text, at)) found.add(what);
      token.lastIndex = at;
      if (!token.test(text)) break;
      at = token.lastIndex;
    }
  }
  return [...found];
}

/**
 * What `markups` hold that a sketch may not, each also read with CSS escapes
 * decoded, since SVG reads its presentation attributes as CSS; `css` is read
 * with its escapes decoded.
 */
function forbiddenIn(markups: string[], css: string): string[] {
  const decoded = decodeCssEscapes(css);
  const texts = [
    ...new Set([...markups, ...markups.map(decodeCssEscapes), decoded]),
  ];
  const attributes = new Set(
    texts.flatMap((text) =>
      TAG_READINGS.flatMap((token) => attributeRefusals(text, token)),
    ),
  );
  return [
    ...MARKUP_FORBIDDEN.filter(([holds]) => texts.some(holds)),
    ...ATTRIBUTE_FORBIDDEN.filter(([, what]) => attributes.has(what)),
    ...CSS_FORBIDDEN.filter(([holds]) => holds(decoded)),
  ].map(([, what]) => what);
}

/** What `html` holds that a sketch may not, read as written and with its character references decoded. */
function htmlRefusals(html: string): string[] {
  const decoded = decodeReferences(html);
  return forbiddenIn(
    [html, decoded],
    `${cssInHtml(html)}\n${cssInHtml(decoded)}`,
  );
}

function cssRefusals(css: string): string[] {
  return forbiddenIn([css], css);
}

/**
 * What a sketch holds that its frame may not load or link: one description per
 * rule it breaks, empty when the sketch is static HTML and CSS. The CSS of
 * `css` and of the `<style>` elements and `style` attributes of `html` is read
 * with its escapes decoded. This module needs only `zod`, so a process without
 * the AntelopeJS runtime can require it as `@antelopejs/dms/sketch`.
 */
export function sketchRefusals(sketch: {
  html: string;
  css?: string;
}): string[] {
  return [...htmlRefusals(sketch.html), ...cssRefusals(sketch.css ?? "")];
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
    ...htmlRefusals(html).map((what) => ({ field: "html", what })),
    ...cssRefusals(css ?? "").map((what) => ({
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
