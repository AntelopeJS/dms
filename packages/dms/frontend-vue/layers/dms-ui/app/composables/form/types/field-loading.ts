import type { InjectionKey } from "vue";

export type SetFieldLoading = (id: string, isLoading: boolean) => void;

export const FORM_FIELD_LOADING_KEY: InjectionKey<SetFieldLoading> =
  Symbol("form-field-loading");
