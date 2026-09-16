import type { InjectionKey } from "vue";

export type FormValidator = () => boolean;
export type RegisterValidator = (validator: FormValidator) => () => void;

export const FORM_VALIDATOR_KEY: InjectionKey<RegisterValidator> =
  Symbol("form-validator");
