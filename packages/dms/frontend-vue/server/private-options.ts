import type { DmsServerEvent } from "#dms/server";
import { z } from "zod";

/**
 * A secret of the DMS's private options, as the frontend server hands them
 * to its routes. The manifest's value wins; the environment variable of the
 * same secret is the fallback, read only when the manifest holds none. A
 * frontend built without the bootstrap credential gets no private options at
 * all, so the environment variable alone configures it there.
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
  const options = event.module.privateOptions[section];
  const secret = z
    .string()
    .safeParse(options == null ? undefined : Object(options)[key]);
  if (secret.success && secret.data) return secret.data;
  return process.env[variable] || undefined;
}
