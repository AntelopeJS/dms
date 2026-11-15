import path from "node:path";
import type { ProbeConfig } from "@antelopejs/interface-database-catalog";
import type { DatabaseEngine } from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { driverPackageName } from "./driver-packages";
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
 * A driver's `probe` as the check loads it: its answer is read by `ReadProbeAnswer`, since the
 * driver is loaded at runtime from wherever the project installs it.
 */
export type LoadedProbe = z.infer<typeof ProbeExport>;

const ENGINE_LABELS: Record<DatabaseEngine, string> = {
  postgres: "PostgreSQL",
  mysql: "MySQL or MariaDB",
  mongodb: "MongoDB",
  rethinkdb: "RethinkDB",
};

/** Where the check requires the driver's `probe` of an engine from, and from which bases. */
export interface ProbeTarget {
  specifier: string;
  bases: string[];
}

let basesForTests: string[] | undefined;

/**
 * Where the `probe` of the driver of `engine` is required from: its package's `dist/probe`, from
 * this module's dependencies first, then from the project's.
 */
export function probeTarget(engine: DatabaseEngine): ProbeTarget {
  return {
    specifier: `${driverPackageName(engine)}/dist/probe`,
    bases: basesForTests ?? [
      __filename,
      path.join(resolveProjectRoot(), "package.json"),
    ],
  };
}

/** Replaces the bases a driver's `probe` is required from, for specs; with none, the installed ones again. */
export function setProbeBasesForTests(bases?: string[]): void {
  basesForTests = bases;
}

type ProbeLoader = (engine: DatabaseEngine) => LoadedProbe | undefined;

let probeLoader: ProbeLoader | undefined;

/** The `probe` a spec runs in this process in place of the driver's, when it set one. */
export function testProbeLoader(): ProbeLoader | undefined {
  return probeLoader;
}

/** Runs a spec's `probe` in this process in place of the driver's, for specs; with no loader, the driver's in its own process again. */
export function setProbeLoaderForTests(loader?: ProbeLoader): void {
  probeLoader = loader;
}

/** The sentence for an engine whose driver, with its `probe`, is installed neither with this module nor in the project. */
export function missingDriver(engine: DatabaseEngine): string {
  return `Install ${driverPackageName(engine)} to connect a ${ENGINE_LABELS[engine]} database.`;
}
