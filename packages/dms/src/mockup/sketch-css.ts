import type { UrlForm } from "./sketch-allowlist";
import { type CSSToken, cssTokenizer } from "./sketch-tokens";

const {
  isTokenAtKeyword,
  isTokenBadString,
  isTokenBadURL,
  isTokenCloseCurly,
  isTokenCloseParen,
  isTokenCloseSquare,
  isTokenComma,
  isTokenDelim,
  isTokenFunction,
  isTokenIdent,
  isTokenNumeric,
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
/** How many brackets and functions CSS may nest. */
const MAX_DEPTH = 64;

/** What a function does with what it holds. */
type FunctionKind =
  /** Loads a URL from its first argument, which must be a quoted local string. */
  | "url"
  /** Loads the strings it holds as images. */
  | "image"
  /** Holds strings as text, never as a URL. */
  | "text"
  /** Holds values, and no string at all. */
  | "value";

/** Every function a sketch's CSS may call, by name once unescaped, lower-cased and stripped of a vendor prefix. */
const FUNCTIONS: ReadonlyMap<string, FunctionKind> = new Map([
  ...(["url", "src"] as const).map((name) => [name, "url"] as const),
  ...(["image", "image-set", "cross-fade"] as const).map(
    (name) => [name, "image"] as const,
  ),
  ...(
    [
      "attr",
      "counters",
      "env",
      "format",
      "lang",
      "local",
      "path",
      "tech",
      "var",
    ] as const
  ).map((name) => [name, "text"] as const),
  ...[
    "rgb",
    "rgba",
    "hsl",
    "hsla",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "color",
    "color-mix",
    "light-dark",
    "calc",
    "min",
    "max",
    "clamp",
    "round",
    "mod",
    "rem",
    "sin",
    "cos",
    "tan",
    "asin",
    "acos",
    "atan",
    "atan2",
    "pow",
    "sqrt",
    "hypot",
    "log",
    "exp",
    "abs",
    "sign",
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "repeating-linear-gradient",
    "repeating-radial-gradient",
    "repeating-conic-gradient",
    "matrix",
    "matrix3d",
    "translate",
    "translatex",
    "translatey",
    "translatez",
    "translate3d",
    "scale",
    "scalex",
    "scaley",
    "scalez",
    "scale3d",
    "rotate",
    "rotatex",
    "rotatey",
    "rotatez",
    "rotate3d",
    "skew",
    "skewx",
    "skewy",
    "perspective",
    "blur",
    "brightness",
    "contrast",
    "drop-shadow",
    "grayscale",
    "hue-rotate",
    "invert",
    "opacity",
    "saturate",
    "sepia",
    "counter",
    "repeat",
    "minmax",
    "fit-content",
    "cubic-bezier",
    "steps",
    "linear",
    "inset",
    "circle",
    "ellipse",
    "polygon",
    "rect",
    "xywh",
    "not",
    "is",
    "where",
    "has",
    "nth-child",
    "nth-last-child",
    "nth-of-type",
    "nth-last-of-type",
    "dir",
    "selector",
  ].map((name) => [name, "value"] as const),
]);

/** Every at-rule a sketch's CSS may hold, none of which can load a URL by itself. */
const AT_RULES = new Set([
  "container",
  "font-face",
  "keyframes",
  "layer",
  "media",
  "page",
  "scope",
  "starting-style",
  "supports",
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

/** The function that owns what a frame holds, with whether a `url()`'s first argument is still to come. */
interface Owner {
  name: string;
  kind: FunctionKind;
  awaitsUrl: boolean;
}

/** An open function or bracket: its closing token, and the function that owns what it holds. */
interface Frame {
  closer: "paren" | "square" | "curly";
  owner: Owner | undefined;
}

/** `value` with its ASCII letters lower-cased and nothing else, as CSS matches names: `\212A` (the Kelvin sign) stays itself. */
function asciiLowerCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

function nameOf(value: string): string {
  return asciiLowerCase(value).replace(VENDOR_PREFIX, "");
}

function isLoader(owner: Owner | undefined): boolean {
  return owner?.kind === "url" || owner?.kind === "image";
}

/**
 * Reads the tokens of one sketch's CSS, one at a time, with constant work per
 * token: each frame keeps the function that owns it from the moment it is
 * opened, a count of open loader functions answers whether a token sits
 * inside one, and only the innermost frame is closed, as the CSS spec does.
 */
class CssWalk {
  readonly refusals = new Set<string>();
  private readonly frames: Frame[] = [];
  private openLoaders = 0;

  /** Whether the walk read `token` within the nesting bound. */
  read(token: CSSToken): boolean {
    if (isTokenWhiteSpaceOrComment(token)) return true;
    const refusal = this.refusalOf(token);
    if (refusal !== undefined) this.refusals.add(refusal);
    if (this.open(token)) {
      if (this.frames.length <= MAX_DEPTH) return true;
      this.refusals.add(`CSS nested more than ${MAX_DEPTH} brackets deep`);
      return false;
    }
    this.close(token);
    return true;
  }

  private get top(): Frame | undefined {
    return this.frames.at(-1);
  }

  private refusalOf(token: CSSToken): string | undefined {
    if (isTokenBadString(token) || isTokenBadURL(token)) {
      return "a CSS string or url() a browser reads as broken";
    }
    if (isTokenAtKeyword(token)) {
      const name = nameOf(token[4].value);
      return AT_RULES.has(name)
        ? undefined
        : `an @${name} rule, which a sketch may not hold`;
    }
    if (isTokenURL(token)) {
      return localUrlForm(token[4].value) === undefined
        ? "a url() that is not an #anchor or a data:image/ URL"
        : undefined;
    }
    if (isTokenFunction(token)) return this.functionRefusal(token[4].value);
    const owner = this.top?.owner;
    if (owner?.awaitsUrl) {
      owner.awaitsUrl = false;
      if (!isTokenString(token) && !isTokenCloseParen(token)) {
        return `a ${owner.name}() whose URL is not a quoted string`;
      }
    }
    if (isTokenString(token)) return stringRefusal(token[4].value, owner);
    if (this.openLoaders > 0) return loaderTokenRefusal(token, owner);
    return owner?.name === "attr" ? attrRefusal(token) : undefined;
  }

  private functionRefusal(value: string): string | undefined {
    const name = nameOf(value);
    const kind = FUNCTIONS.get(name);
    if (this.openLoaders > 0 && kind !== "image") {
      return `a ${name}() inside a url(), src() or image function`;
    }
    return kind === undefined
      ? `a ${name}() function, which a sketch may not call`
      : undefined;
  }

  private open(token: CSSToken): boolean {
    if (isTokenFunction(token)) {
      const name = nameOf(token[4].value);
      const kind = FUNCTIONS.get(name) ?? "value";
      const owner: Owner = { name, kind, awaitsUrl: kind === "url" };
      if (isLoader(owner)) this.openLoaders += 1;
      this.frames.push({ closer: "paren", owner });
      return true;
    }
    const owner = this.top?.owner;
    if (isTokenOpenParen(token)) this.frames.push({ closer: "paren", owner });
    else if (isTokenOpenSquare(token)) {
      this.frames.push({ closer: "square", owner });
    } else if (isTokenOpenCurly(token)) {
      this.frames.push({ closer: "curly", owner: undefined });
    } else return false;
    return true;
  }

  private close(token: CSSToken): void {
    const top = this.top;
    if (top === undefined || !closes(top, token)) return;
    this.frames.pop();
    if (isLoader(top.owner) && top.owner !== this.top?.owner) {
      this.openLoaders -= 1;
    }
  }
}

function closes(frame: Frame, token: CSSToken): boolean {
  if (frame.closer === "paren") return isTokenCloseParen(token);
  if (frame.closer === "square") return isTokenCloseSquare(token);
  return isTokenCloseCurly(token);
}

function stringRefusal(
  value: string,
  owner: Owner | undefined,
): string | undefined {
  if (owner === undefined || owner.kind === "text") return undefined;
  if (isLoader(owner)) {
    return localUrlForm(value) === undefined
      ? `a ${owner.name}() string that is not an #anchor or a data:image/ URL`
      : undefined;
  }
  return `a string inside ${owner.name}(), which holds no text`;
}

/** What a token inside a `url()`, `src()` or image function may be: a local string, a number, a word such as `2x`, a comma. */
function loaderTokenRefusal(
  token: CSSToken,
  owner: Owner | undefined,
): string | undefined {
  if (
    isTokenNumeric(token) ||
    isTokenIdent(token) ||
    isTokenComma(token) ||
    isTokenCloseParen(token)
  ) {
    return undefined;
  }
  return `a ${token[0]} inside ${owner?.name ?? "a url"}(), which the check cannot classify`;
}

function attrRefusal(token: CSSToken): string | undefined {
  if (
    isTokenIdent(token) &&
    ATTR_URL_TYPES.has(asciiLowerCase(token[4].value))
  ) {
    return "an attr() read as a URL";
  }
  return isTokenDelim(token) && token[4].value === "<"
    ? "an attr() read as a typed value"
    : undefined;
}

/**
 * The tokens of `css`, or `undefined` when the tokenizer gives up: it throws
 * on a name longer than the engine lets it spread into one string, which a
 * check must refuse rather than let through.
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
 * browser reads it: escapes, newlines and comments as the CSS Syntax spec
 * reads them. Every function and at-rule must be on the sketch's allowlists,
 * a `url()`, `src()` or image function may only hold an `#anchor` or a
 * `data:image/` URL with numbers and words such as `2x`, and a string is
 * allowed only where it is text.
 */
export function cssRefusals(css: string): string[] {
  const tokens = tokensOf(css);
  if (tokens === undefined) return ["CSS the tokenizer cannot read"];
  const walk = new CssWalk();
  for (const token of tokens) {
    if (!walk.read(token)) break;
  }
  return [...walk.refusals];
}
