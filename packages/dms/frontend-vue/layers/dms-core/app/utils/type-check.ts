// oxlint-disable-next-line anti-slop/no-unknown-returns -- A generic callable guard cannot infer a return contract before the caller invokes the external function.
type CallableFunction = (...args: any[]) => unknown;

const createTypeGuard =
  <T>(type: string) =>
  (v: unknown): v is T =>
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This primitive boundary guard implements JavaScript typeof semantics; owner types cannot classify unparsed values.
    typeof v === type;

export const isString = createTypeGuard<string>("string");
export const isNumber = createTypeGuard<number>("number");
export const isBoolean = createTypeGuard<boolean>("boolean");
export const isUndefined = createTypeGuard<undefined>("undefined");
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- This exported representation guard has no schema owner; narrowing its values would change the public contract.
export const isObject = createTypeGuard<Record<string, unknown>>("object");
export const isFunction = createTypeGuard<CallableFunction>("function");
export const isBigint = createTypeGuard<bigint>("bigint");
export const isSymbol = createTypeGuard<symbol>("symbol");

export const isNull = (value: unknown): value is null => value === null;

export const isDate = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime());

export const isJSON = (value: Parameters<typeof isString>[0]): boolean => {
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
