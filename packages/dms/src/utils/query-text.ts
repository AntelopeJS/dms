import type { QueryValue } from "@antelopejs/interface-api";

/** A query parameter's text, or `undefined` when it is absent or given without a value (`?name`). */
export function queryText(value: QueryValue): string | undefined {
  return value === true ? undefined : value;
}
