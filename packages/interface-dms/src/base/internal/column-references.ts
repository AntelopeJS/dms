/** @internal @packageDocumentation */
import { isNull, isObject, isString } from "../../utils/internal/type-check";
import { badgeItems } from "./column-badges";

/**
 * A column of the table a field or a table view reads, whose values the DMS
 * reads from the rows when a table view serves the page.
 *
 * @internal
 */
export interface ColumnReference {
  column: string;
}

/**
 * The option a select's input carries the column its `items` are read from under.
 *
 * @internal
 */
export const ITEMS_FROM_KEY = "itemsFrom";

/**
 * The option a price's input carries the column its `currency` is read from under.
 *
 * @internal
 */
export const CURRENCY_FROM_KEY = "currencyFrom";

type ColumnReferenceKey = typeof ITEMS_FROM_KEY | typeof CURRENCY_FROM_KEY;

/**
 * The text values a request read from each column it references, sorted. A
 * column that could not be read, or holds more values than a badge draws, is
 * absent.
 *
 * @internal
 */
export type ReadColumnValues = ReadonlyMap<string, readonly string[]>;

/**
 * The options of a serialized input that read its items or its currency
 * from a column.
 *
 * @internal
 */
export interface ReferencingOptions {
  [ITEMS_FROM_KEY]?: ColumnReference;
  [CURRENCY_FROM_KEY]?: ColumnReference;
  items?: unknown;
  currency?: unknown;
}

const KNOWN_CURRENCIES: ReadonlySet<string> = new Set(
  Intl.supportedValuesOf("currency"),
);

function isColumnReference(value: unknown): value is ColumnReference {
  return (
    isObject(value) &&
    !isNull(value) &&
    "column" in value &&
    isString(value.column)
  );
}

/** @internal */
export function isReferencingOptions(
  value: unknown,
): value is ReferencingOptions {
  if (!isObject(value) || isNull(value)) return false;
  const itemsFrom = ITEMS_FROM_KEY in value ? value[ITEMS_FROM_KEY] : undefined;
  const currencyFrom =
    CURRENCY_FROM_KEY in value ? value[CURRENCY_FROM_KEY] : undefined;
  return (
    (itemsFrom !== undefined || currencyFrom !== undefined) &&
    (itemsFrom === undefined || isColumnReference(itemsFrom)) &&
    (currencyFrom === undefined || isColumnReference(currencyFrom))
  );
}

/**
 * `options` carrying `reference` under `key`, for the table view that serves
 * the input to read; `options` itself without a reference.
 *
 * @internal
 */
export function withColumnReference<T extends object>(
  options: T,
  key: ColumnReferenceKey,
  reference: ColumnReference | undefined,
): T {
  return reference ? { ...options, [key]: reference } : options;
}

/**
 * The columns an input reads its items or its currency from.
 *
 * @internal
 */
export function referencedColumns(options: ReferencingOptions): string[] {
  return [options.itemsFrom, options.currencyFrom].flatMap((reference) =>
    reference ? [reference.column] : [],
  );
}

function soleCurrency(
  values: readonly string[] | undefined,
): string | undefined {
  const [only, ...rest] = values ?? [];
  return only !== undefined && rest.length === 0 && KNOWN_CURRENCIES.has(only)
    ? only
    : undefined;
}

/**
 * Fills an input that reads from a column, in place: a select's `items`
 * from the badges of its column's values, a price's `currency` from the one
 * ISO 4217 code its column holds. An input whose column `read` lacks keeps
 * its own. Its references are cleared either way, so no client reads one.
 *
 * @internal
 */
export function fillReferencingOptions(
  options: ReferencingOptions,
  read: ReadColumnValues | undefined,
): void {
  const { itemsFrom, currencyFrom } = options;
  const values = itemsFrom && read?.get(itemsFrom.column);
  if (values) {
    options.items = badgeItems(values).map(({ value, label, tone }) => ({
      label,
      value,
      textColor: tone,
    }));
  }
  const currency = currencyFrom && soleCurrency(read?.get(currencyFrom.column));
  if (currency) options.currency = currency;
  options[ITEMS_FROM_KEY] = undefined;
  options[CURRENCY_FROM_KEY] = undefined;
}
