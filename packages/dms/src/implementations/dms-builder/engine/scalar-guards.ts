/** Whether a value is a string, the way `typeof` answers. */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Whether a value is a number, the way `typeof` answers: `NaN` included. */
export function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/** Whether a value is a boolean, the way `typeof` answers. */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** A literal a filter can bake into a chain. */
export type Scalar = string | number | boolean;

/** Whether a value is a string, a number or a boolean. */
export function isScalar(value: unknown): value is Scalar {
  return isString(value) || isNumber(value) || isBoolean(value);
}

/** Whether a value is one of the listed options. */
export function isOneOf<Option extends string>(
  options: readonly Option[],
  value: unknown,
): value is Option {
  return options.some((option) => option === value);
}
