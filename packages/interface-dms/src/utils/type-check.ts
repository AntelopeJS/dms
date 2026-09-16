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

export const isString = createTypeGuard<string>("string");
export const isNumber = createTypeGuard<number>("number");
export const isBoolean = createTypeGuard<boolean>("boolean");
export const isUndefined = createTypeGuard<undefined>("undefined");
export const isObject = createTypeGuard<object>("object");
export const isFunction =
  createTypeGuard<(...args: unknown[]) => unknown>("function");
export const isBigint = createTypeGuard<bigint>("bigint");
export const isSymbol = createTypeGuard<symbol>("symbol");

export const isPrimitive = (value: unknown): value is Primitive =>
  (primitiveTypes as readonly string[]).includes(typeof value);

export const isNull = (value: unknown): value is null => value === null;

export const isDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

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
