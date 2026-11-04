/**
 * JSON primitive values
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Recursive type for JSON-serializable values
 */
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
