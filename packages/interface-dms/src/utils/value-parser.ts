import { isBoolean, isDate, isNull, isNumber, isString } from "./type-check";

export type Primitive =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | Record<string, unknown>
  | unknown[];

const KEYWORD_VALUES = {
  true: true,
  false: false,
  null: null,
  undefined: undefined,
};

const STRING_TYPE_PARSERS = [
  {
    test: isStringKeyword,
    parse: (value: string) =>
      KEYWORD_VALUES[value as keyof typeof KEYWORD_VALUES],
  },
  {
    test: isStringNumber,
    parse: (value: string) => Number(value),
  },
  {
    test: isStringDate,
    parse: (value: string) => new Date(value),
  },
  {
    test: isStringJSON,
    parse: (value: string) => JSON.parse(value),
  },
];

/**
 * Parse a string value to its appropriate type
 * @param value String value to parse
 * @returns Parsed data (boolean, number, Date, object, array, null, undefined, or string).
 * Function-syntax strings remain unchanged; input is never executed as code.
 * @example
 * parseValue('true') // returns true
 * parseValue('42') // returns 42
 * parseValue('2024-01-01') // returns Date object
 * parseValue('{"key": "value"}') // returns {key: "value"}
 * parseValue('(x) => x * 2') // returns '(x) => x * 2'
 * parseValue('not a number') // returns 'not a number'
 * parseValue('null') // returns null
 * parseValue('undefined') // returns undefined
 */
export function parseValue(value: string): Primitive {
  for (const parser of STRING_TYPE_PARSERS) {
    if (parser.test(value)) {
      return parser.parse(value);
    }
  }
  return value;
}

/**
 * Parse an array of key-value pairs, converting values to appropriate types
 * @param items Array of key-value pairs with string values
 * @returns Object with parsed values in their appropriate types
 * @example
 * parseObject([
 *   {key: 'enabled', value: 'true'},
 *   {key: 'count', value: '42'}
 * ]) // returns {enabled: true, count: 42}
 */
export function parseObject(
  items: Array<{ key: string; value: string }>,
): Record<string, Primitive> {
  const result: Record<string, Primitive> = {};
  for (const item of items) {
    result[item.key] = parseValue(item.value);
  }
  return result;
}

/**
 * Check if a value is a string representation of a keyword
 * @param value String value to check
 * @returns True if value is a keyword ('true', 'false', 'null', 'undefined'), false otherwise
 * @example
 * isStringKeyword('null') // returns true
 * isStringKeyword('unknown') // returns false
 */
export function isStringKeyword(value: string): boolean {
  return Object.keys(KEYWORD_VALUES).includes(value);
}

/**
 * Check if a value is a string representation of a number
 * @param value String value to check
 * @returns True if value can be parsed as a valid number, false otherwise
 * @example
 * isStringNumber('42') // returns true
 * isStringNumber('3.14') // returns true
 * isStringNumber('abc') // returns false
 */
export function isStringNumber(value: string): boolean {
  return value !== "" && !Number.isNaN(Number(value));
}

/**
 * Check if a value is a string representation of a date
 * @param value String value to check (ISO 8601 format)
 * @returns True if value is a valid ISO 8601 date string, false otherwise
 * @example
 * isStringDate('2024-01-01') // returns true
 * isStringDate('2024-01-01T12:00:00Z') // returns true
 * isStringDate('invalid-date') // returns false
 */
export function isStringDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?)?$/.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/**
 * Check if a value is a string representation of JSON
 * @param value String value to check
 * @returns True if value is valid JSON of any kind, including scalars, false otherwise
 * @example
 * isStringJSON('{"key": "value"}') // returns true
 * isStringJSON('[1, 2, 3]') // returns true
 * isStringJSON('42') // returns true
 * isStringJSON('not json') // returns false
 */
export function isStringJSON(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

const PRIMITIVE_TYPE_VALIDATORS = [
  isString,
  isNumber,
  isBoolean,
  isDate,
  isNull,
];
export const assertPrimitiveValue = (value: unknown): void => {
  if (PRIMITIVE_TYPE_VALIDATORS.some((test) => test(value))) {
    return;
  }
  throw new Error(
    `Value must be a string, number, boolean, or Date for is comparison. Got: ${typeof value}`,
  );
};
