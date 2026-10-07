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
