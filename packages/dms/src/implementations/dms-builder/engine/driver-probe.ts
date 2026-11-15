import path from "node:path";
import type { ProbeConfig } from "@antelopejs/interface-database-catalog";
import type { DatabaseEngine } from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { driverPackageName } from "./driver-packages";
import { loadModuleFrom } from "./module-loader";
import { resolveProjectRoot } from "./project";

const ProbeConfigSchema = z.object({
  url: z.string(),
  timeoutMs: z.number(),
  signal: z.instanceof(AbortSignal),
}) satisfies z.ZodType<ProbeConfig>;

const ProbeExport = z
  .function()
  .args(ProbeConfigSchema)
  .returns(z.promise(z.unknown()));

/**
 * A driver's `probe` as the check loads it: its answer is read by `readProbeAnswer`, since the
 * driver is loaded at runtime from wherever the project installs it.
 */
export type LoadedProbe = z.infer<typeof ProbeExport>;

const ProbeModule = z.object({ probe: ProbeExport });

/** What Node throws when a package, or a file of it, is not installed. */
const NotInstalled = z.object({
  code: z.literal("MODULE_NOT_FOUND"),
  message: z.string(),
});

const ENGINE_LABELS: Record<DatabaseEngine, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL or MariaDB",
  mongodb: "MongoDB",
  rethinkdb: "RethinkDB",
};

/** The file of a driver package that exports `probe`. */
function probeSpecifier(engine: DatabaseEngine): string {
  return `${driverPackageName(engine)}/dist/probe`;
}

/**
 * The `probe` of the driver of `engine`, required only when its engine is checked: from this
 * module's dependencies first, then from the project's. `undefined` when neither installs a
 * release that has it. A driver that is installed but fails to load throws.
 */
function installedProbe(engine: DatabaseEngine): LoadedProbe | undefined {
  const specifier = probeSpecifier(engine);
  const bases = [__filename, path.join(resolveProjectRoot(), "package.json")];
  for (const base of bases) {
    try {
      const loaded = ProbeModule.safeParse(loadModuleFrom(base, specifier));
      return loaded.success ? loaded.data.probe : undefined;
    } catch (error) {
      const failure = NotInstalled.safeParse(error);
      if (
        !failure.success ||
        !failure.data.message.includes(`'${specifier}'`)
      ) {
        throw error;
      }
    }
  }
  return undefined;
}

type ProbeLoader = (engine: DatabaseEngine) => LoadedProbe | undefined;

let probeLoader: ProbeLoader = installedProbe;

/** The `probe` of the driver of `engine`, as `installedProbe` finds it. */
export function loadProbe(engine: DatabaseEngine): LoadedProbe | undefined {
  return probeLoader(engine);
}

/** Replaces how the check finds a driver's `probe`, for specs; with no loader, the installed drivers again. */
export function setProbeLoaderForTests(loader?: ProbeLoader): void {
  probeLoader = loader ?? installedProbe;
}

/** The sentence for an engine whose driver, with its `probe`, is installed neither with this module nor in the project. */
export function missingDriver(engine: DatabaseEngine): string {
  return `Install ${driverPackageName(engine)} to connect a ${ENGINE_LABELS[engine]} database.`;
}
