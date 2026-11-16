import type {
  ColumnProfile,
  RelationDescription,
  RelationProfile,
} from "@antelopejs/interface-database-catalog";
import { words } from "./name-words";

const CODE_IN_TEXT = /\b[A-Z]{3}\b/g;
const CURRENCY_WORD = "currency";
const CURRENCY_COLUMN_SUFFIXES: ReadonlySet<string> = new Set([
  "currency",
  "code",
]);

const KNOWN_CURRENCIES: ReadonlySet<string> = new Set(
  Intl.supportedValuesOf("currency"),
);

/** Whether a value is an ISO 4217 code the platform formats (`USD`, not `usd` or `DOLLARS`). */
export function isCurrencyCode(value: unknown): value is string {
  return typeof value === "string" && KNOWN_CURRENCIES.has(value);
}

/**
 * The currency a column's comment states: the only ISO 4217 code in "Total (USD)" or "Amount in
 * EUR". A comment naming two codes states none.
 */
export function currencyOfComment(
  comment: string | null | undefined,
): string | undefined {
  const codes = new Set(
    (comment?.match(CODE_IN_TEXT) ?? []).filter(isCurrencyCode),
  );
  return codes.size === 1 ? [...codes][0] : undefined;
}

/** A column that holds a currency code: `currency`, `currency_code`, `order_currency`. */
function isCurrencyColumn(column: string): boolean {
  const parts = words(column);
  const last = parts.at(-1);
  return (
    last !== undefined &&
    (last === CURRENCY_WORD ||
      (CURRENCY_COLUMN_SUFFIXES.has(last) && parts.at(-2) === CURRENCY_WORD))
  );
}

/** The one code a column holds in every row it fills, when its profile shows it. */
function soleCode(
  profile: ColumnProfile | undefined,
  rows: number | undefined,
): string | undefined {
  const categories =
    profile?.categories?.status === "ok" ? profile.categories.value : undefined;
  const nulls = profile?.nulls?.status === "ok" ? profile.nulls.value : 0;
  const [only, ...rest] = categories?.values ?? [];
  if (
    !only ||
    rest.length > 0 ||
    categories?.other !== 0 ||
    !isCurrencyCode(only.value) ||
    rows === undefined ||
    only.rows !== rows - nulls
  ) {
    return undefined;
  }
  return only.value;
}

/**
 * The currency a sibling column of the relation holds in every row: a `currency` column with one
 * value. Two currency columns that disagree, or one with several values, state none.
 */
export function currencyOfSibling(
  description: RelationDescription,
  profile: RelationProfile | undefined,
  rows: number | undefined,
): string | undefined {
  const codes = new Set(
    description.columns
      .filter((column) => isCurrencyColumn(column.name))
      .map((column) =>
        soleCode(
          profile?.columns.find((entry) => entry.name === column.name),
          rows,
        ),
      ),
  );
  const [code] = codes;
  return codes.size === 1 ? code : undefined;
}

/**
 * What a price writes for its currency: a code as written, a currency column of its relation the
 * page reads the code from, or none (euros).
 */
export type PriceCurrency =
  | { currency: string }
  | { currencyFrom: { column: string } }
  | undefined;

/** What the database states about an amount column's currency, read from its schema alone. */
export interface CurrencySchema {
  /** The code the amount column's comment states. */
  stated?: string;
  /** The relation's columns named like a currency (`currency`, `currency_code`). */
  columns: string[];
  /** The columns the mapping declares. */
  mapped: ReadonlySet<string>;
}

/** The columns of a relation named like a currency: the only ones a code read from rows comes from. */
export function currencyColumnsOf(description: RelationDescription): string[] {
  return description.columns
    .map((column) => column.name)
    .filter(isCurrencyColumn);
}

/**
 * How a price writes `given`, the currency its display holds. The code the amount column's
 * comment states is schema, written as such. A relation with currency columns may have given its
 * code from their rows, so it is never written: its one mapped currency column is read when the
 * page is served, else the price is plain. In a relation without one, a code the caller gave is
 * written.
 */
export function priceCurrency(
  given: string | undefined,
  { stated, columns, mapped }: CurrencySchema,
): PriceCurrency {
  if (given !== undefined && given === stated) {
    return { currency: given };
  }
  const [only, ...rest] = columns;
  if (only === undefined) {
    return given === undefined ? undefined : { currency: given };
  }
  return rest.length === 0 && mapped.has(only)
    ? { currencyFrom: { column: only } }
    : undefined;
}

/**
 * The currency an amount column is in, when the database says: its comment, else a sibling
 * currency column that holds one code.
 */
export function currencyOfColumn(
  description: RelationDescription,
  profile: RelationProfile | undefined,
  rows: number | undefined,
  column: string,
): string | undefined {
  return (
    currencyOfComment(
      description.columns.find((entry) => entry.name === column)?.comment,
    ) ?? currencyOfSibling(description, profile, rows)
  );
}
