const primitiveTypes = [
  "string",
  "number",
  "boolean",
  "undefined",
  "bigint",
  "symbol",
] as const;
type Primitive = (typeof primitiveTypes)[number];

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
  createTypeGuard<(...args: unknown[]) => unknown>("function");
/** @internal */
export const isBigint = createTypeGuard<bigint>("bigint");
/** @internal */
export const isSymbol = createTypeGuard<symbol>("symbol");

/** @internal */
export const isPrimitive = (value: unknown): value is Primitive =>
  (primitiveTypes as readonly string[]).includes(typeof value);

/** @internal */
export const isNull = (value: unknown): value is null => value === null;

/** @internal */
export const isDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

/** @internal */
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
