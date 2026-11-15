import type { JsonValue } from "../../../../dms-core/app/types/json";

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
