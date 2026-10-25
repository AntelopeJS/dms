import striptags from "striptags";
import { DEFAULT_FALLBACK, DETAIL_FALLBACK } from "./useColumnValueRenderer";

// A rich-text value is HTML: a cell reads its text, never its markup.

// The end of a block or a line break: its text is kept apart from the next.
const BLOCK_BREAK =
  /<\/(?:p|div|li|h[1-6]|blockquote|pre|tr|td|th)>|<br\s*\/?>/gi;
const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi;
const WHITESPACE = /\s+/g;
const HEX_PREFIX = "#x";
const DECIMAL_PREFIX = "#";
const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
const MAX_CODE_POINT = 0x10ffff;

// The named entities an editor writes; any other is left as written.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** The options of a column naming the text of its empty values. */
interface FallbackOptions {
  fallback?: unknown;
}

/** The empty-value texts of the two surfaces a value is drawn on. */
interface RichTextFallbacks {
  cell: string;
  detail: string;
}

const FALLBACKS: RichTextFallbacks = {
  cell: DEFAULT_FALLBACK,
  detail: DETAIL_FALLBACK,
};

function decodeCodePoint(digits: string, radix: number): string | undefined {
  const codePoint = Number.parseInt(digits, radix);
  if (!Number.isInteger(codePoint) || codePoint < 0) return undefined;
  if (codePoint > MAX_CODE_POINT) return undefined;
  return String.fromCodePoint(codePoint);
}

function decodeEntity(entity: string, name: string): string {
  const lower = name.toLowerCase();
  if (lower.startsWith(HEX_PREFIX)) {
    return decodeCodePoint(lower.slice(HEX_PREFIX.length), HEX_RADIX) ?? entity;
  }
  if (lower.startsWith(DECIMAL_PREFIX)) {
    return (
      decodeCodePoint(lower.slice(DECIMAL_PREFIX.length), DECIMAL_RADIX) ??
      entity
    );
  }
  return NAMED_ENTITIES[lower] ?? entity;
}

/**
 * The text of a rich-text document on one line: its tags stripped (a block
 * or a line break kept as a space), its entities decoded, its whitespace
 * collapsed. A value that is not a text reads as empty.
 */
export function richTextToPlainText(html: unknown): string {
  if (typeof html !== "string") return "";
  const text = striptags(html.replace(BLOCK_BREAK, (tag) => `${tag} `));
  return text.replace(ENTITY, decodeEntity).replace(WHITESPACE, " ").trim();
}

/** A text the column names for its empty values (`options.fallback`). */
const columnFallback = (options: unknown): string | undefined => {
  if (typeof options !== "object" || options === null) return undefined;
  const { fallback } = options as FallbackOptions;
  return typeof fallback === "string" ? fallback : undefined;
};

const formatOn =
  (surface: keyof RichTextFallbacks) =>
  (value: unknown, _locale: string, options: unknown): string =>
    richTextToPlainText(value) ||
    (columnFallback(options) ?? FALLBACKS[surface]);

/**
 * The formatter of the `rich_text` data type: its plain text in a grid cell
 * and where a record is read, an empty document (`<p></p>`) reading as any
 * empty value does.
 */
export const richTextFormatter = {
  cell: formatOn("cell"),
  default: formatOn("detail"),
};
