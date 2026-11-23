export type FormFieldValue =
  | string
  | number
  | boolean
  | Date
  | null
  | { [key: string]: FormFieldValue | undefined }
  | FormFieldValue[];

export interface FormData {
  [key: string]: FormFieldValue;
}
