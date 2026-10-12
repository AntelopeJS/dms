import type { InjectionKey } from "vue";

/**
 * A check a `Form` runs before each submit: `false` stops the submit before
 * anything is sent. See `useEnclosingForm().addValidator`.
 */
export type FormValidator = () => boolean;

/** Adds a {@link FormValidator} to a `Form`; returns its removal. */
export type RegisterValidator = (validator: FormValidator) => () => void;

/**
 * What a `Form` provides to register a validator. Kept for the fields that
 * inject it; a module's field calls `useEnclosingForm().addValidator`.
 */
export const FORM_VALIDATOR_KEY: InjectionKey<RegisterValidator> =
  Symbol("form-validator");
