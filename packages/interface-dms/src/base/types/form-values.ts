export type { DefaultValue } from "../../component-options/form-field";

/**
 * Valid form field values
 */
export type FormFieldValue =
  | string
  | number
  | boolean
  | Date
  | null
  | FormFieldValue[];
