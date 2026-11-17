import { type QueryValue } from "@antelopejs/interface-api";

/** Reads a query parameter as text: a bare `?name` counts as absent. */
export function queryText(value: QueryValue): string | undefined {
  return value === true ? undefined : value;
}
