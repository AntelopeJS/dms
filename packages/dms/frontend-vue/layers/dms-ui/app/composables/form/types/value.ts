import type { DataTypeValue } from "#dms-core/app/types/data-type";

/** What a form holds for a field once it has a value: a data type's value. */
export type FormFieldValue = Exclude<DataTypeValue, undefined>;

/** The values a form holds, by field id. */
export interface FormData {
  [field: string]: DataTypeValue;
}
