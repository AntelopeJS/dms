import striptags from "striptags";
import type { DataTypeFormatter } from "#dms-core/app/composables/data-types/useDataType";
import { isObject, isString } from "#dms-core/app/utils/type-check";
import { DEFAULT_FALLBACK, DETAIL_FALLBACK } from "./useColumnValueRenderer";

/** A value a formatter is handed, and the options of its column. */
type CellValue = Parameters<DataTypeFormatter>[0];
type ColumnOptions = Parameters<DataTypeFormatter>[2];

const BLOCK_BREAK =
  /<\/(?:p|div|li|h[1-6]|blockquote|pre|tr|td|th)>|<br\s*\/?>/gi;
const ENTITY = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi;
const WHITESPACE = /\s+/g;
const HEX_PREFIX = "#x";
const DECIMAL_PREFIX = "#";
const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
const MAX_CODE_POINT = 0x10ffff;

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

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
  return NAMED_ENTITIES.get(lower) ?? entity;
}

/**
 * The text of a rich-text document on one line: its tags stripped (a block
 * or a line break kept as a space), its entities decoded, its whitespace
 * collapsed. A value that is not a text reads as empty.
 */
export function richTextToPlainText(html: CellValue): string {
  if (!isString(html)) return "";
  const text = striptags(html.replace(BLOCK_BREAK, (tag) => `${tag} `));
  return text.replace(ENTITY, decodeEntity).replace(WHITESPACE, " ").trim();
}

/** A text the column names for its empty values (`options.fallback`). */
const columnFallback = (options: ColumnOptions): string | undefined => {
  if (!isObject(options) || options === null) return undefined;
  const { fallback } = options;
  return isString(fallback) ? fallback : undefined;
};

const formatOn =
  (surface: keyof RichTextFallbacks) =>
  (value: CellValue, _locale: string, options?: ColumnOptions): string =>
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
