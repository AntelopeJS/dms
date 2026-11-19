import type { JsonPrimitive, JsonValue } from "./json";

/**
 * A value of a field, as a row, a form or a filter holds it: JSON as the
 * server sends it, a date a control writes, `undefined` when unset. A
 * relation holds its row.
 */
export type DataTypeValue =
  | JsonPrimitive
  | Date
  | undefined
  | DataTypeList
  | DataTypeRow;

/** A list of values, as a multiple field holds them. */
export interface DataTypeList extends Array<DataTypeValue> {}

/** A row of a table, or any record of field values, by field id. */
export interface DataTypeRow {
  [field: string]: DataTypeValue;
}

/**
 * The options a data type reads: its control's component options as the page
 * declares them, or the ones a caller composes, an option left unset when
 * absent.
 */
export interface DataTypeOptions {
  readonly [option: string]: JsonValue | undefined;
}

export type ComponentOrNoInput =
  | ComponentInfo<ComponentOptionsData>
  | "noInput";

export interface DataTypeConfig {
  id: string;
  compareModes: string[];
  defaultCompareMode?: string;
  filterComponents: Record<string, ComponentOrNoInput>;
  inputComponent: ComponentInfo<ComponentOptionsData>;
}
