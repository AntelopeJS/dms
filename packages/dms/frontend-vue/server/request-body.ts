import type { DmsServerEvent } from "#dms/server";
import type { JsonValue } from "../layers/dms-core/app/types/json";

/** A JSON object, as a parsed request body holds one. */
export type JsonObject = { [key: string]: JsonValue };

/** Whether `value` and every value it holds is JSON, walked without recursion so that no nesting depth `JSON.parse` accepts exhausts the stack. */
function isJsonValue(value: unknown): value is JsonValue {
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

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    isJsonValue(value)
  );
}

/**
 * The request's JSON body when it is an object, `undefined` when it is any
 * other JSON value (`null`, an array, a string, a number, a boolean). The
 * fields a route reads from it are the route's to check.
 */
export async function readJsonObject(
  event: DmsServerEvent,
): Promise<JsonObject | undefined> {
  const body = await event.readJson();
  return isJsonObject(body) ? body : undefined;
}

/** What `readJson` answers a body that is not JSON. */
export function invalidBody(): Response {
  return Response.json({ message: "Invalid request body" }, { status: 400 });
}
