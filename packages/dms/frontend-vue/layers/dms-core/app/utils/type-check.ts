/** Any function: what it returns is unknown until a guard reads it. */
type CallableFunction = (...args: any[]) => Parameters<typeof isNull>[0];

/** The type each `typeof` result a guard below tests for narrows to. */
interface TypeofResults {
  string: string;
  number: number;
  boolean: boolean;
  undefined: undefined;
  function: CallableFunction;
  bigint: bigint;
  symbol: symbol;
}

const createTypeGuard =
  <K extends keyof TypeofResults>(type: K) =>
  (v: unknown): v is TypeofResults[K] =>
    typeof v === type;

export const isString = createTypeGuard("string");
export const isNumber = createTypeGuard("number");
export const isBoolean = createTypeGuard("boolean");
export const isUndefined = createTypeGuard("undefined");
export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object";
export const isFunction = createTypeGuard("function");
export const isBigint = createTypeGuard("bigint");
export const isSymbol = createTypeGuard("symbol");

export const isNull = (value: unknown): value is null => value === null;

export const isDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

export const isJSON = (value: Parameters<typeof isString>[0]): boolean => {
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
