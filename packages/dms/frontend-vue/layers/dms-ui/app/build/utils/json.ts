import type {
  JsonPrimitive,
  JsonValue,
} from "../../../../dms-core/app/types/json";

/** A JSON object, as a parsed response or a `spec.json` holds one. */
export type JsonObject = { [key: string]: JsonValue };

/** Whether `value` and every value it holds is JSON, walked without recursion so that no nesting depth `JSON.parse` accepts exhausts the stack. */
export function isJsonValue(value: unknown): value is JsonValue {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === null || ["string", "number", "boolean"].includes(typeof next))
      continue;
    if (typeof next !== "object") return false;
    for (const held of Array.isArray(next) ? next : Object.values(next))
      pending.push(held);
  }
  return true;
}

/** Whether `value` is a JSON object: not `null`, not a list, and JSON all the way down. */
export function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isJsonValue(value)
  );
}

/** Whether a value already known to be JSON is an object: not `null`, not a list. */
export function isObjectValue(
  value: JsonValue | undefined,
): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A JSON object as code writes one: a field set to `undefined` is absent, as `JSON.stringify` leaves it out. */
export type JsonWritableObject = { [key: string]: JsonWritable | undefined };

/** A value `JSON.stringify` writes as the same JSON: JSON whose objects may hold `undefined` fields. */
export type JsonWritable = JsonPrimitive | JsonWritable[] | JsonWritableObject;

/** Whether `value` is {@link JsonWritable} all the way down, walked without recursion like {@link isJsonValue}. */
export function isJsonWritable(value: unknown): value is JsonWritable {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (next === null || ["string", "number", "boolean"].includes(typeof next))
      continue;
    if (typeof next !== "object") return false;
    const held = Array.isArray(next)
      ? next
      : Object.values(next).filter((field) => field !== undefined);
    for (const entry of held) pending.push(entry);
  }
  return true;
}

/** Whether a value already known to be {@link JsonWritable} is an object: not `null`, not a list. */
export function isWritableObject(
  value: JsonWritable | undefined,
): value is JsonWritableObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
