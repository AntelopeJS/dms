import type { DmsServerEvent } from "#dms/server";

/**
 * A secret of the DMS's private options, as the frontend server hands them
 * to its routes: the manifest's value, which the environment variable of the
 * same secret replaces. A frontend built without the bootstrap credential
 * gets no private options at all; the environment variable alone then
 * configures it, as it did when the renderer served these routes.
 *
 * @param event The route's event
 * @param section The private options' section (`htmlRender`, `oauth`)
 * @param key The secret's key in it
 * @param variable The environment variable that configures it
 */
export function privateSecret(
  event: DmsServerEvent,
  section: string,
  key: string,
  variable: string,
): string | undefined {
  const options = event.module.privateOptions[section] as
    | Record<string, unknown>
    | undefined;
  const value = options?.[key];
  if (typeof value === "string" && value) return value;
  return process.env[variable] || undefined;
}
