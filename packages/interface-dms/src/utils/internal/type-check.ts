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

const createTypeGuard =
  <T>(type: string) =>
  (v: unknown): v is T =>
    typeof v === type;

/** @internal */
export const isString = createTypeGuard<string>("string");
/** @internal */
export const isNumber = createTypeGuard<number>("number");
/** @internal */
export const isBoolean = createTypeGuard<boolean>("boolean");
/** @internal */
export const isUndefined = createTypeGuard<undefined>("undefined");
/** @internal */
export const isObject = createTypeGuard<object>("object");
/** @internal */
export const isFunction =
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- The published function predicate promises no result shape for arbitrary callable values.
  createTypeGuard<(...args: unknown[]) => unknown>("function");
/** @internal */
export const isBigint = createTypeGuard<bigint>("bigint");
/** @internal */
export const isSymbol = createTypeGuard<symbol>("symbol");

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
    const parsed = JSON.parse(value);
    return isObject(parsed) && !isNull(parsed);
  } catch {
    return false;
  }
};
