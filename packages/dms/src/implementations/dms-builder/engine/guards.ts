import type {
  ConfigObject,
  ConfigValue,
} from "@antelopejs/interface-dms-builder";
import { isString } from "./scalar-guards";

/** A value read off a literal in source: data only, nothing executable. */
export type LiteralValue = ConfigValue;

/** An object literal read as data. */
export type LiteralObject = ConfigObject;

/** Whether a value is a string or absent. */
export function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

/** Whether a value is an object whose every value is a string. */
export function isStringRecord(
  value: unknown,
): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(isString)
  );
}

/** Whether a value met at run time can be read by property name: an object, an array or a function. */
export function isIndexable(value: unknown): value is Record<string, unknown> {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
}

/** Whether a literal value read from source is an object, not an array or a scalar. */
export function isLiteralObject(value: LiteralValue): value is LiteralObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Whether a value can be called. */
export function isCallable(value: unknown): value is Function {
  return typeof value === "function";
}
