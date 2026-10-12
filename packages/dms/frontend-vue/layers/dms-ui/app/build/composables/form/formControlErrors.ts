import type { InjectionKey } from "vue";

/** Where a form collects the errors its controls report, by field id. */
export interface FormControlErrors {
  report: (fieldId: string, message: string | undefined) => void;
}

export const FORM_CONTROL_ERRORS_KEY: InjectionKey<FormControlErrors> = Symbol(
  "dms-form-control-errors",
);
