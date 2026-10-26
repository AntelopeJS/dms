import type { Component } from "vue";

export type RecordWithDefault<T> = Record<string, T> & { default: T };

/**
 * Turns a value into its display. `row` is the whole listed row when the value
 * is drawn in a table (cell, detail band), so a formatter can compose sibling
 * fields; it is absent elsewhere (forms, filters) and must be optional.
 *
 * Keys of a data type's `formatter` record: `default` (required), `cell` (a
 * shorter grid rendering), `empty` (drawn instead of the fallback for a
 * null/undefined value), and one per compare mode for filter chips.
 */
/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type -- These declarations own the open module data-type extension contract. No shared schema exists for plugin values, options, rows or render results; inference from built-in implementations would exclude third-party formats. */
export type DataTypeFormatter = (
  value: unknown,
  locale: string,
  options?: unknown,
  row?: Record<string, unknown>,
) => unknown;

/**
 * Reshapes a server value into its form-state representation.
 * Must be idempotent: form reset re-applies the mapper to values that
 * may already be mapped (e.g. restored from a submit-success snapshot).
 */
export type BeforeStateMapper = (value: unknown, options?: unknown) => unknown;

/**
 * Whether two values of a data type are the same value, whatever shape each
 * comes in: a form compares the value it loaded from the server with the one
 * its control holds through it, to tell an edited field from an untouched one.
 */
export type DataTypeValueComparer = (
  left: unknown,
  right: unknown,
  options?: unknown,
) => boolean;

/**
 * The value a filter chip's editor holds for a filter value a view declared
 * as text (`"0"`, `"2026-10-01,2026-10-15"`), under a compare mode: a number
 * input refuses `"0"`, a date range wants its two days. The filter itself
 * keeps its text, so the query is unchanged.
 */
export type DataTypeFilterEditorValue = (text: string, mode: string) => unknown;
/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type */

/**
 * Where the rows a value names are read: the `select` route of the table a
 * relation points to, and the keys its rows carry their label and value under
 * (`label` and `value` unless mapped).
 */
export interface DataTypeSelectSource {
  searchUrl: string;
  keyMapping?: { label?: string; value?: string };
}

export interface DataType {
  id: string;
  formatter?: RecordWithDefault<DataTypeFormatter>;
  beforeStateMapper?: BeforeStateMapper;
  /**
   * How two values of the type compare, for a type whose server value and
   * form state differ in shape (a relation loaded as its row, held as its id)
   * or whose order does not count. Without it, values compare deeply.
   */
  isSameValue?: DataTypeValueComparer;
  /** Without it, a filter's editor reads a declared text value as is. */
  filterEditorValue?: DataTypeFilterEditorValue;
  /**
   * For a type whose value holds the ids of rows another table serves (a
   * relation): where those rows are read, from the options of the type's
   * control. A filter chip or a read-only list names the ids through it.
   */
  selectSource?: (
    options: Parameters<DataTypeFormatter>[2],
  ) => DataTypeSelectSource | undefined;
  displayComponent?: Component;
}
const dataTypes: Record<string, DataType> = {};

export const useDataTypes = () => {
  function registerDataType(dataType: DataType) {
    dataTypes[dataType.id] = dataType;
  }

  function getDataType(id: string) {
    return dataTypes[id];
  }

  return {
    registerDataType,
    getDataType,
  };
};
