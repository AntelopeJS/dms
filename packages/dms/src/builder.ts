import { ImplementInterface } from "@antelopejs/interface-core";
import { isBuilderEnabled } from "./config";

/**
 * Serves `@antelopejs/interface-dms-builder` from this module when the builder
 * is enabled: in development, or when `builder.enabled` says so. The imports
 * are dynamic so a production start never loads the engine or `ts-morph`.
 * In development it also serves the Branding editor, which a production start
 * never does, `builder.enabled` or not.
 *
 * @param dev Whether the runtime is in development mode.
 * @param env The configuration environment core launched with, which decides
 * the access of each external connection.
 */
export async function startBuilder(dev: boolean, env: string): Promise<void> {
  if (!isBuilderEnabled(dev)) return;
  const { recordLaunchEnvironment } =
    await import("./implementations/dms-builder/engine");
  recordLaunchEnvironment(env);
  void ImplementInterface(
    await import("@antelopejs/interface-dms-builder"),
    await import("./implementations/dms-builder"),
  );
  if (dev) (await import("./branding")).registerBranding();
}
