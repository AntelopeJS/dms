import type { UrlForm } from "./sketch-allowlist";
import { type CSSToken, cssTokenizer } from "./sketch-tokens";

const {
  isTokenAtKeyword,
  isTokenBadString,
  isTokenBadURL,
  isTokenCloseCurly,
  isTokenCloseParen,
  isTokenCloseSquare,
  isTokenDelim,
  isTokenFunction,
  isTokenIdent,
  isTokenOpenCurly,
  isTokenOpenParen,
  isTokenOpenSquare,
  isTokenString,
  isTokenURL,
  isTokenWhiteSpaceOrComment,
  tokenize,
} = cssTokenizer;

/** The characters a URL parser drops anywhere in a URL: tab, line feed, carriage return. */
const URL_DROPPED = /[\t\n\r]/g;
/** The last code point a URL parser trims from both ends: C0 controls and space. */
const URL_TRIMMED_MAX = 0x20;
const ANCHOR = /^#/;
const DATA_IMAGE = /^data:image\//i;
const VENDOR_PREFIX = /^-(?:webkit|moz|ms|o)-/;

/** Functions whose string argument is a URL the browser loads. */
const URL_FUNCTIONS = new Set(["url", "src"]);
/** Functions that load the strings they hold as images. */
const IMAGE_FUNCTIONS = new Set(["image", "image-set", "cross-fade"]);
/** Functions that substitute a value the check cannot see where they are written. */
const SUBSTITUTIONS = new Set(["var", "env", "attr"]);
/** Functions whose strings are text, never a URL: font names and formats, counter styles, languages. */
const TEXT_FUNCTIONS = new Set([
  "attr",
  "counters",
  "format",
  "lang",
  "local",
  "symbols",
  "tech",
  "type",
]);
/** What `attr()` may not name, since `attr(x url)` and `attr(x type(<url>))` read an attribute as a URL. */
const ATTR_URL_TYPES = new Set(["url", "uri"]);

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

/** A function or bracket the tokens are inside, and the token that closes it. */
type Frame =
  | { kind: "function"; name: string; awaitsUrl: boolean }
  | { kind: "block"; closer: "(" | "[" | "{" };

function functionName(token: CSSToken): string | undefined {
  return isTokenFunction(token)
    ? token[4].value.toLowerCase().replace(VENDOR_PREFIX, "")
    : undefined;
}

/** The function a string or argument belongs to: the innermost one not behind a `{` block. */
function enclosingFunction(
  frames: Frame[],
): Extract<Frame, { kind: "function" }> | undefined {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame === undefined) return undefined;
    if (frame.kind === "function") return frame;
    if (frame.closer === "{") return undefined;
  }
  return undefined;
}

function insideLoader(frames: Frame[]): boolean {
  return frames.some(
    (frame) =>
      frame.kind === "function" &&
      (URL_FUNCTIONS.has(frame.name) || IMAGE_FUNCTIONS.has(frame.name)),
  );
}

function closes(frame: Frame, token: CSSToken): boolean {
  if (frame.kind === "function") return isTokenCloseParen(token);
  if (frame.closer === "(") return isTokenCloseParen(token);
  if (frame.closer === "[") return isTokenCloseSquare(token);
  return isTokenCloseCurly(token);
}

function close(frames: Frame[], token: CSSToken): void {
  const index = frames.findLastIndex((frame) => closes(frame, token));
  if (index !== -1) frames.length = index;
}

function open(frames: Frame[], token: CSSToken): boolean {
  const name = functionName(token);
  if (name !== undefined) {
    frames.push({ kind: "function", name, awaitsUrl: URL_FUNCTIONS.has(name) });
    return true;
  }
  if (isTokenOpenParen(token)) frames.push({ kind: "block", closer: "(" });
  else if (isTokenOpenSquare(token))
    frames.push({ kind: "block", closer: "[" });
  else if (isTokenOpenCurly(token)) frames.push({ kind: "block", closer: "{" });
  else return false;
  return true;
}

const NOT_LOCAL = "a url() that is not an #anchor or a data:image/ URL";

/** What one token holds that a sketch may not, read in the functions and brackets `frames` holds open. */
function tokenRefusal(token: CSSToken, frames: Frame[]): string | undefined {
  if (isTokenBadString(token) || isTokenBadURL(token)) {
    return "a CSS string or url() a browser reads as broken";
  }
  if (isTokenAtKeyword(token) && token[4].value.toLowerCase() === "import") {
    return "a CSS @import";
  }
  if (isTokenURL(token)) {
    return localUrlForm(token[4].value) === undefined ? NOT_LOCAL : undefined;
  }
  const owner = enclosingFunction(frames);
  if (owner?.awaitsUrl) {
    owner.awaitsUrl = false;
    if (!isTokenString(token))
      return "a url() or src() whose URL is not a quoted string";
  }
  if (isTokenString(token)) return stringRefusal(token[4].value, owner);
  if (
    owner?.name === "attr" &&
    isTokenIdent(token) &&
    ATTR_URL_TYPES.has(token[4].value.toLowerCase())
  ) {
    return "an attr() read as a URL";
  }
  if (owner?.name === "attr" && isTokenDelim(token) && token[4].value === "<") {
    return "an attr() read as a typed value";
  }
  return undefined;
}

function stringRefusal(
  value: string,
  owner: Extract<Frame, { kind: "function" }> | undefined,
): string | undefined {
  if (owner === undefined || TEXT_FUNCTIONS.has(owner.name)) return undefined;
  if (URL_FUNCTIONS.has(owner.name) || IMAGE_FUNCTIONS.has(owner.name)) {
    return localUrlForm(value) === undefined
      ? `a ${owner.name}() string that is not an #anchor or a data:image/ URL`
      : undefined;
  }
  return `a string inside ${owner.name}(), which the check cannot classify`;
}

/**
 * The tokens of `css`, or `undefined` when the tokenizer gives up: it throws
 * on a name longer than about 150,000 characters, which a check must refuse
 * rather than let through.
 */
function tokensOf(css: string): CSSToken[] | undefined {
  try {
    return tokenize({ css });
  } catch {
    return undefined;
  }
}

/**
 * What `css` holds that a sketch may not, read with a CSS tokenizer as a
 * browser reads it: escapes, newlines and comments as the CSS syntax spec
 * reads them. A `url()`, `src()` or image function may only hold an
 * `#anchor` or a `data:image/` URL, and a string inside a function the check
 * does not know is refused rather than guessed at.
 */
export function cssRefusals(css: string): string[] {
  const tokens = tokensOf(css);
  if (tokens === undefined) return ["CSS the tokenizer cannot read"];
  const frames: Frame[] = [];
  const refusals = new Set<string>();
  for (const token of tokens) {
    if (isTokenWhiteSpaceOrComment(token)) continue;
    const name = functionName(token);
    if (name !== undefined && SUBSTITUTIONS.has(name) && insideLoader(frames)) {
      refusals.add(`a ${name}() inside a url(), src() or image function`);
    }
    const refusal = tokenRefusal(token, frames);
    if (refusal !== undefined) refusals.add(refusal);
    if (!open(frames, token)) close(frames, token);
  }
  return [...refusals];
}
