import { isString } from "#dms-core/app/utils/type-check";

/** Whether `value` is a set of strings, such as the field ids a watch action collects. */
export function isStringSet(value: unknown): value is Set<string> {
  return value instanceof Set && [...value].every(isString);
}
