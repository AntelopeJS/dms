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
