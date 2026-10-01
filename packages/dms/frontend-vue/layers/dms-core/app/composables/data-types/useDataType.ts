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

export interface DataType {
  id: string;
  formatter?: RecordWithDefault<DataTypeFormatter>;
  beforeStateMapper?: BeforeStateMapper;
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
