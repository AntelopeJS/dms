import type { Component } from "vue";

export type RecordWithDefault<T> = Record<string, T> & { default: T };

export type DataTypeFormatter = (
  value: unknown,
  locale: string,
  options?: unknown,
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
