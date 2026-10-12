import type { InjectionKey } from "vue";
import type { RegisterValidator } from "../../../composables/form/types/validation";

/**
 * What a `Form` offers the fields it draws (see `useEnclosingForm`).
 *
 * @internal
 */
export interface FormHandle {
  /** Submits as the save button does: validation, validators, then the request. */
  submit: () => Promise<void>;
  registerValidator: RegisterValidator;
  /** Brings a field of the form into view and focuses its control. */
  revealField: (fieldId: string) => Promise<void>;
}

/** @internal */
export const FORM_HANDLE_KEY: InjectionKey<FormHandle> = Symbol("form-handle");

/**
 * The field of `fieldIds` a URL fragment names (`#requestLogMaxBodyKb`, the
 * id its control carries), `undefined` when it names none.
 *
 * @internal
 */
export function linkedFieldId(
  hash: string,
  fieldIds: readonly string[],
): string | undefined {
  if (!hash.startsWith("#")) return undefined;
  let id: string;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return undefined;
  }
  return fieldIds.includes(id) ? id : undefined;
}
