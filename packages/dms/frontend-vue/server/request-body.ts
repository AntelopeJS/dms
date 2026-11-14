import type { DmsServerEvent } from "#dms/server";
import { isObject } from "../layers/dms-core/app/utils/type-check";

/**
 * The request's JSON body when it is an object, `undefined` when it is any
 * other JSON value (`null`, an array, a string, a number, a boolean). The
 * fields a route reads from it are the route's to check.
 */
export async function readJsonObject(
  event: DmsServerEvent,
): Promise<Record<string, unknown> | undefined> {
  const body = await event.readJson();
  return isObject(body) && body !== null && !Array.isArray(body)
    ? body
    : undefined;
}

/** What `readJson` answers a body that is not JSON. */
export function invalidBody(): Response {
  return Response.json({ message: "Invalid request body" }, { status: 400 });
}
