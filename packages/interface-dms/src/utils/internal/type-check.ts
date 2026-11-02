import type { Class } from "@antelopejs/interface-core/decorators";

const primitiveTypes = [
  "string",
  "number",
  "boolean",
  "undefined",
  "bigint",
  "symbol",
] as const;
type Primitive = (typeof primitiveTypes)[number];

interface PrimitiveValueByTag {
  string: string;
  number: number;
  boolean: boolean;
  undefined: undefined;
  bigint: bigint;
  symbol: symbol;
}
type PrimitiveValue = PrimitiveValueByTag[Primitive];

/** @internal */
export const isString = (v: unknown): v is string => typeof v === "string";
/** @internal */
export const isNumber = (v: unknown): v is number => typeof v === "number";
/** @internal */
export const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
/** @internal */
export const isUndefined = (v: unknown): v is undefined =>
  typeof v === "undefined";
/** @internal */
export const isObject = (v: unknown): v is object => typeof v === "object";
/** @internal */
export const isFunction = (
  v: unknown,
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The published function predicate promises no result shape for arbitrary callable values.
): v is (...args: unknown[]) => unknown => typeof v === "function";
/**
 * Whether a value is a class: a function with an object `prototype`, which
 * arrow functions, methods and bound functions lack. A generator function has
 * one too, a language limit this check shares with every `prototype` test.
 *
 * @internal
 */
export const isClass = (value: unknown): value is Class =>
  typeof value === "function" &&
  typeof value.prototype === "object" &&
  value.prototype !== null;
/** @internal */
export const isBigint = (v: unknown): v is bigint => typeof v === "bigint";
/** @internal */
export const isSymbol = (v: unknown): v is symbol => typeof v === "symbol";

/** @internal */
export const isPrimitive = (value: unknown): value is PrimitiveValue => {
  const types: readonly string[] = primitiveTypes;
  return types.includes(typeof value);
};

/** @internal */
export const isNull = (value: unknown): value is null => value === null;

/** @internal */
export const isDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

/** @internal */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This published JSON predicate accepts arbitrary values and rejects nonstrings before parsing.
export const isJSON = (value: unknown): boolean => {
  if (!isString(value)) {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return isObject(parsed) && !isNull(parsed);
  } catch {
    return false;
  }
};
