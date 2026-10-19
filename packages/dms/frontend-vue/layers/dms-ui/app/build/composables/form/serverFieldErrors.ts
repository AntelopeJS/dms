import type { FormServerFieldError } from "../../../composables/form/useForm";
import { fieldErrorPattern } from "./formEntryContext";

/** A refused submit's error a field shows, and the value it was raised against. */
export interface KeptServerError {
  /** The field's value when the server refused it, as JSON. */
  value: string;
  error: FormServerFieldError;
}

/** What is read of the form: the errors UForm holds, by field. */
export interface ServerErrorForm {
  getErrors(name: RegExp): readonly unknown[];
}

/** The value of a field as a kept error compares it. */
export function serverErrorValue(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

/** The fields whose value moved off the one their kept error was raised against. */
export function changedServerErrorFields(
  kept: ReadonlyMap<string, KeptServerError>,
  state: Readonly<Record<string, unknown>>,
): string[] {
  return [...kept]
    .filter(([name, entry]) => serverErrorValue(state[name]) !== entry.value)
    .map(([name]) => name);
}

/**
 * The kept errors their field no longer shows. UForm re-validates a field
 * from its schema alone when an input event of it lands, replacing all of
 * its errors: a number input commits its value as it loses focus, and the
 * event comes 300 ms later, after a refused submit placed its error. The
 * value has not moved, so the server's refusal still holds.
 */
export function droppedServerErrors(
  kept: ReadonlyMap<string, KeptServerError>,
  form: ServerErrorForm,
): FormServerFieldError[] {
  return [...kept.values()]
    .filter(
      (entry) => !form.getErrors(fieldErrorPattern(entry.error.name)).length,
    )
    .map((entry) => entry.error);
}
