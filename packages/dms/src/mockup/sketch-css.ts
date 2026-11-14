import type { UrlForm } from "./sketch-allowlist";

/** CSS's whitespace once its newlines are normalized: space, tab and line feed. Never `\s`, which holds more. */
const WS = "[ \\t\\n]";
/** CSS's newlines, which its parser reads as one line feed. */
const CSS_NEWLINE = /\r\n|\r|\f/g;
const CSS_ESCAPE = new RegExp(
  String.raw`\\([0-9a-fA-F]{1,6})${WS}?|\\\n|\\([^\n0-9a-fA-F])`,
  "g",
);
const MAX_CODE_POINT = 0x10ffff;
const SURROGATES = [0xd800, 0xdfff] as const;
const REPLACEMENT_CHARACTER = "�";
/** The characters a URL parser drops anywhere in a URL: tab, line feed, carriage return. */
const URL_DROPPED = /[\t\n\r]/g;
/** The last code point a URL parser trims from both ends: C0 controls and space. */
const URL_TRIMMED_MAX = 0x20;
const ANCHOR = /^#/;
const DATA_IMAGE = /^data:image\//i;
const URL_FUNCTION = new RegExp(
  String.raw`url\(${WS}*(?:"([^"]*)"|'([^']*)'|([^)"']*))`,
  "gi",
);
const IMAGE_FUNCTION = String.raw`(?:image-set|image|cross-fade|src)\(`;
const DATA_IMAGE_STRING = String.raw`"${WS}*data:image/[\w+/=:;,.%-]*"|'${WS}*data:image/[\w+/=:;,.%-]*'`;
/** An image function whose arguments are only `data:image/` strings, words such as `2x`, and commas. */
const DATA_IMAGE_FUNCTION = new RegExp(
  String.raw`${IMAGE_FUNCTION}(?:${DATA_IMAGE_STRING}|[\w.%+, \t\n-])*\)`,
  "gi",
);
const ANY_IMAGE_FUNCTION = new RegExp(IMAGE_FUNCTION, "i");

function fromCodePoint(codePoint: number): string {
  const surrogate = codePoint >= SURROGATES[0] && codePoint <= SURROGATES[1];
  return codePoint > 0 && codePoint <= MAX_CODE_POINT && !surrogate
    ? String.fromCodePoint(codePoint)
    : REPLACEMENT_CHARACTER;
}

/**
 * `css` as a CSS parser reads its characters: newlines normalized, NUL
 * replaced, escapes decoded and a backslash before a newline dropped.
 * Comments stay: they only ever separate what a parser reads, so a check of
 * the text with them sees everything the parser sees.
 */
export function decodeCss(css: string): string {
  return css
    .replace(CSS_NEWLINE, "\n")
    .replaceAll("\u0000", REPLACEMENT_CHARACTER)
    .replace(
      CSS_ESCAPE,
      (_, hex: string | undefined, char: string | undefined) =>
        hex === undefined
          ? (char ?? "")
          : fromCodePoint(Number.parseInt(hex, 16)),
    );
}

/**
 * Which of the two places a sketch may point to `url` is, read as a URL
 * parser reads it (tab and newlines dropped, controls and spaces trimmed): an
 * `#anchor` or a `data:image/` URL. Anything else is `undefined`.
 */
export function localUrlForm(url: string): UrlForm | undefined {
  const kept = url.replace(URL_DROPPED, "");
  let start = 0;
  let end = kept.length;
  while (start < end && kept.charCodeAt(start) <= URL_TRIMMED_MAX) start += 1;
  while (end > start && kept.charCodeAt(end - 1) <= URL_TRIMMED_MAX) end -= 1;
  const parsed = kept.slice(start, end);
  if (ANCHOR.test(parsed)) return "anchor";
  return DATA_IMAGE.test(parsed) ? "image" : undefined;
}

function urlOutsideSketch(css: string): boolean {
  return [...css.matchAll(URL_FUNCTION)].some(
    (match) =>
      localUrlForm(match[1] ?? match[2] ?? match[3] ?? "") === undefined,
  );
}

/** A test decoded CSS fails, and what the CSS then holds. */
type CssRule = readonly [(css: string) => boolean, string];

const CSS_FORBIDDEN: ReadonlyArray<CssRule> = [
  [(css) => /@import/i.test(css), "a CSS @import"],
  [urlOutsideSketch, "a url() that is not an #anchor or a data:image/ URL"],
  [
    (css) => ANY_IMAGE_FUNCTION.test(css.replace(DATA_IMAGE_FUNCTION, "")),
    "an image(), image-set(), cross-fade() or src() holding anything but data:image/ strings",
  ],
  [
    (css) =>
      new RegExp(
        String.raw`["']${WS}*(?:(?:https?|ftp|wss?|file|blob|filesystem):|//)`,
        "i",
      ).test(css),
    "a quoted URL that is not a data: URL",
  ],
  [
    (css) =>
      /(?:java|vb)script:|expression\(|-moz-binding|behavior:/i.test(css),
    "a script URL, expression() or binding in CSS",
  ],
];

/** What `css` holds that a sketch may not, read with {@link decodeCss}. */
export function cssRefusals(css: string): string[] {
  const decoded = decodeCss(css);
  return CSS_FORBIDDEN.filter(([holds]) => holds(decoded)).map(
    ([, what]) => what,
  );
}
