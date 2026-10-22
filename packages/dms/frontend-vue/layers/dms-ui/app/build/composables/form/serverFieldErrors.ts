/**
 * A server error as UForm holds it once placed: on the field, or on the part
 * of it the error names (`address.street`).
 */
export interface PlacedServerError {
  name?: string;
  message: string;
}

/** A refused submit's errors a field shows, and the value they were raised against. */
export interface KeptServerError {
  /** The field's value when the server refused it, as JSON. */
  value: string;
  errors: PlacedServerError[];
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
 * The kept server errors, as UForm's `validate` answers them. UForm runs it
 * with its schema on every validation and replaces a field's errors with what
 * both answer: a number input commits its value as it loses focus, and the
 * input event, landing 300 ms later, re-validates the field after a refused
 * submit placed its error. A field still holding the refused value keeps it.
 * A submit validates without them: the server judges the values again.
 */
export function keptServerErrors(
  kept: ReadonlyMap<string, KeptServerError>,
  state: Readonly<Record<string, unknown>>,
  isSubmitting: boolean,
): PlacedServerError[] {
  if (isSubmitting) return [];
  return [...kept]
    .filter(([name, entry]) => serverErrorValue(state[name]) === entry.value)
    .flatMap(([, entry]) => entry.errors);
}
