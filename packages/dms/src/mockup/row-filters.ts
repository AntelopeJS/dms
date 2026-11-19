import { z } from "zod";
import type { Json, JsonObject } from "./model";

/** The query key prefix of a column filter: `filter_<field>=<mode>:<value>`. */
const FILTER_PREFIX = "filter_";

const LIST_SEPARATOR = ",";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/**
 * One column filter of a list query, as a table sends it for a tab, a quick
 * filter, a column filter or a saved view. A table repeats the key once per
 * filter on a field, and a row must pass them all.
 */
export interface ColumnFilter {
  field: string;
  mode: string;
  value: string;
}

/** Whether a cell passes a filter's value. */
type Test = (cell: Json | undefined, value: string) => boolean;

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);

/** The values a cell holds, as text: its scalar, or each scalar entry of a list. */
function cellTexts(cell: Json | undefined): string[] {
  if (Array.isArray(cell)) return cell.flatMap(cellTexts);
  const scalar = scalarSchema.safeParse(cell);
  return scalar.success ? [String(scalar.data)] : [];
}

function isNumeric(text: string): boolean {
  return text.trim() !== "" && Number.isFinite(Number(text));
}

/** Where `text` sits on a line: a number, or an ISO date as its epoch. */
function positionOf(text: string): number | undefined {
  const trimmed = text.trim();
  if (isNumeric(trimmed)) return Number(trimmed);
  if (!ISO_DAY.test(trimmed)) return undefined;
  const epoch = Date.parse(trimmed);
  return Number.isNaN(epoch) ? undefined : epoch;
}

function sameValue(text: string, wanted: string): boolean {
  if (text === wanted) return true;
  return (
    isNumeric(text) && isNumeric(wanted) && Number(text) === Number(wanted)
  );
}

/** Whether the cell, or one of its entries, equals the value or one of its comma-separated values. */
function isAny(cell: Json | undefined, value: string): boolean {
  const wanted = [value, ...value.split(LIST_SEPARATOR)];
  return cellTexts(cell).some((text) =>
    wanted.some((candidate) => sameValue(text, candidate)),
  );
}

function containsText(cell: Json | undefined, value: string): boolean {
  const needle = value.toLowerCase();
  return cellTexts(cell).some((text) => text.toLowerCase().includes(needle));
}

/** The positions of the cell's values on a line; a value off the line has none. */
function positionsOf(cell: Json | undefined): number[] {
  return cellTexts(cell).flatMap((text) => {
    const position = positionOf(text);
    return position === undefined ? [] : [position];
  });
}

function ordered(accept: (here: number, bound: number) => boolean): Test {
  return (cell, value) => {
    const bound = positionOf(value);
    return (
      bound !== undefined &&
      positionsOf(cell).some((here) => accept(here, bound))
    );
  };
}

function isBetween(cell: Json | undefined, value: string): boolean {
  const bounds = value.split(LIST_SEPARATOR).map(positionOf);
  const [low, high] = bounds;
  if (bounds.length !== 2 || low === undefined || high === undefined) {
    return false;
  }
  return positionsOf(cell).some((here) => here >= low && here <= high);
}

function isEmpty(cell: Json | undefined): boolean {
  return (
    cell === undefined ||
    cell === null ||
    cell === "" ||
    (Array.isArray(cell) && cell.length === 0)
  );
}

/**
 * The compare modes a table sends, as the DMS registers them
 * (`DefaultDataCompareTypes`). `is` and `include` also read a quick filter's
 * comma-separated values as any of them, and a list cell matches when one of
 * its entries does.
 */
const MODES: ReadonlyMap<string, Test> = new Map<string, Test>([
  ["is", isAny],
  ["is_not", (cell, value) => !isAny(cell, value)],
  ["include", isAny],
  ["exclude", (cell, value) => !isAny(cell, value)],
  ["contains", containsText],
  ["not_contains", (cell, value) => !containsText(cell, value)],
  ["array_contains_string", containsText],
  ["greater_than", ordered((here, bound) => here > bound)],
  ["less_than", ordered((here, bound) => here < bound)],
  ["greater_than_or_equal_to", ordered((here, bound) => here >= bound)],
  ["less_than_or_equal_to", ordered((here, bound) => here <= bound)],
  ["is_between", isBetween],
  ["is_empty", isEmpty],
  ["is_not_empty", (cell) => !isEmpty(cell)],
]);

/**
 * The column filters of a list query, in the order they were sent. A filter
 * with no field, or of a mode no data controller has, is left out, so it
 * keeps every row.
 */
export function parseColumnFilters(params: URLSearchParams): ColumnFilter[] {
  return [...params.entries()].flatMap(([key, raw]): ColumnFilter[] => {
    if (!key.startsWith(FILTER_PREFIX) || key === FILTER_PREFIX) return [];
    const separator = raw.indexOf(":");
    const mode = separator < 0 ? raw : raw.slice(0, separator);
    if (!MODES.has(mode)) return [];
    return [
      {
        field: key.slice(FILTER_PREFIX.length),
        mode,
        value: separator < 0 ? "" : raw.slice(separator + 1),
      },
    ];
  });
}

/** Whether `row` passes every filter. */
export function passesFilters(
  row: JsonObject,
  filters: readonly ColumnFilter[],
): boolean {
  return filters.every(({ field, mode, value }) => {
    const cell = Object.hasOwn(row, field) ? row[field] : undefined;
    return MODES.get(mode)?.(cell, value) ?? true;
  });
}
