import {
  ImplementInterface,
  type InterfaceToImpl,
} from "@antelopejs/interface-core";
import { isBuilderEnabled } from "./config";

type BuilderInterface = typeof import("@antelopejs/interface-dms-builder");

/** What every builder call rejects with when this environment does not serve the builder. */
export const BUILDER_DISABLED_MESSAGE =
  "The DMS builder is not enabled in this environment. Run the project with ajs project dev, or set builder.enabled in the dms module's config.";

function refuseBuilderCall(): Promise<never> {
  return Promise.reject(new Error(BUILDER_DISABLED_MESSAGE));
}

/** Every operation of the interface's `Operations` map, under its own name and in the map, each rejecting at once, so a caller fails fast instead of waiting for a provider. */
function disabledBuilder(
  declaration: BuilderInterface,
): InterfaceToImpl<BuilderInterface> {
  const refusing = Object.fromEntries(
    Object.keys(declaration.Operations).map((name) => [
      name,
      refuseBuilderCall,
    ]),
  );
  return { ...refusing, Operations: refusing };
}

/**
 * Serves `@antelopejs/interface-dms-builder` from this module. When the
 * builder is enabled (in development, or when `builder.enabled` says so) the
 * engine answers; otherwise every operation rejects at once with
 * {@link BUILDER_DISABLED_MESSAGE}. The engine's imports are dynamic so a
 * production start never loads the engine or `ts-morph`.
 * In development it also serves the Branding editor, which a production start
 * never does, `builder.enabled` or not.
 *
 * @param dev Whether the runtime is in development mode.
 * @param env The configuration environment core launched with, which decides
 * the access of each external connection.
 */
export async function startBuilder(dev: boolean, env: string): Promise<void> {
  if (!isBuilderEnabled(dev)) {
    const declaration = await import("@antelopejs/interface-dms-builder");
    ImplementInterface(declaration, disabledBuilder(declaration));
    return;
  }
  const { recordLaunchEnvironment } =
    await import("./implementations/dms-builder/engine");
  recordLaunchEnvironment(env);
  void ImplementInterface(
    await import("@antelopejs/interface-dms-builder"),
    await import("./implementations/dms-builder"),
  );
  if (dev) (await import("./branding")).registerBranding();
}
