import path from "node:path";
import type {
  DatabaseEngine,
  DriverPackage,
} from "@antelopejs/interface-dms-builder";
import semver from "semver";
import { z } from "zod";
import { loadModuleFrom } from "./module-loader";
import { resolveProjectRoot } from "./project";

/** The releases of a driver from `from` until the next segment's, and the interface range they need. */
interface ReleaseSegment {
  from: string;
  interfaceDatabase: string;
}

interface Driver {
  package: string;
  segments: ReleaseSegment[];
}

/**
 * The releases of each driver the connect flow installs, by the `@antelopejs/interface-database`
 * range each one's own dependency names, oldest first. A project on another line of the interface
 * gets a range of its own segments only: a release for another line fails to resolve. Each table
 * starts at the driver's first release that exports `probe` and provides
 * `@antelopejs/interface-database-catalog` 0.1, the line this module consumes: core refuses an
 * earlier release beside it. On `@antelopejs/interface-database` 0.4.1 and later, which hands a
 * cursor batches of rows, it starts at the release that answers in batches. Moving the DMS to another line of an interface, or a driver
 * release, means updating this table only.
 */
const DRIVERS: ReadonlyMap<DatabaseEngine, Driver> = new Map<
  DatabaseEngine,
  Driver
>([
  [
    "postgres",
    {
      package: "@antelopejs/postgres",
      segments: [
        { from: "0.4.1", interfaceDatabase: ">=0.4.0 <0.4.1" },
        { from: "0.4.2", interfaceDatabase: ">=0.4.1 <0.5.0" },
      ],
    },
  ],
  [
    "mysql",
    {
      package: "@antelopejs/mysql",
      segments: [
        { from: "0.2.3", interfaceDatabase: ">=0.4.0 <0.4.1" },
        { from: "0.2.4", interfaceDatabase: ">=0.4.1 <0.5.0" },
      ],
    },
  ],
  [
    "mongodb",
    {
      package: "@antelopejs/mongodb",
      segments: [
        { from: "1.8.3", interfaceDatabase: ">=0.4.0 <0.4.1" },
        { from: "1.8.4", interfaceDatabase: ">=0.4.1 <0.5.0" },
      ],
    },
  ],
  [
    "rethinkdb",
    {
      package: "@antelopejs/rethinkdb",
      segments: [
        { from: "1.10.2", interfaceDatabase: ">=0.4.0 <0.4.1" },
        { from: "1.10.3", interfaceDatabase: ">=0.4.1 <0.5.0" },
      ],
    },
  ],
]);

/** The package of the driver module of `engine`. */
export function driverPackageName(engine: DatabaseEngine): string {
  const driver = DRIVERS.get(engine);
  if (!driver) throw new Error(`No driver package is declared for ${engine}`);
  return driver.package;
}

const Manifest = z.object({ version: z.string() });

/**
 * The version of `@antelopejs/interface-database` the project resolves. Inside the runtime, core
 * sends a module's require of an interface package to the copy it chose for the project, so this
 * reads the version a driver must be built for. Outside it, the project's copy comes first, then
 * this module's. Nothing when neither resolves it.
 */
export function resolvedInterfaceDatabase(): string | undefined {
  const bases = [path.join(resolveProjectRoot(), "package.json"), __filename];
  for (const base of bases) {
    try {
      return Manifest.parse(
        loadModuleFrom(base, "@antelopejs/interface-database/package.json"),
      ).version;
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * The range of a driver's releases built for `interfaceDatabase`: from its first such segment to
 * the start of the segment after its last one. The newest segment stops at the driver's next
 * minor, since no later release is known to be built for that version.
 */
function rangeFor(
  { segments }: Driver,
  interfaceDatabase: string,
): string | undefined {
  const fitting = segments
    .map(({ from, interfaceDatabase: needs }, index) => ({
      from,
      needs,
      until: segments[index + 1]?.from ?? semver.inc(from, "minor") ?? from,
    }))
    .filter(({ needs }) => semver.satisfies(interfaceDatabase, needs));
  const first = fitting.at(0);
  const last = fitting.at(-1);
  return first && last ? `>=${first.from} <${last.until}` : undefined;
}

/** The driver of each engine a project on `interfaceDatabase` can install, with that range. */
export function driverPackages(
  interfaceDatabase: string | undefined,
): Partial<Record<DatabaseEngine, DriverPackage>> {
  if (!interfaceDatabase || !semver.valid(interfaceDatabase)) {
    return {};
  }
  const drivers: Partial<Record<DatabaseEngine, DriverPackage>> = {};
  for (const [engine, driver] of DRIVERS) {
    const version = rangeFor(driver, interfaceDatabase);
    if (version) {
      drivers[engine] = { package: driver.package, version };
    }
  }
  return drivers;
}
