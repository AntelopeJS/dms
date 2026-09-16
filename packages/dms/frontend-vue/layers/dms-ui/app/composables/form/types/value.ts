export type FormFieldValue =
  | string
  | number
  | boolean
  | Date
  | null
  | Record<string, string>
  | FormFieldValue[];

export interface FormData {
  [key: string]: FormFieldValue;
}
