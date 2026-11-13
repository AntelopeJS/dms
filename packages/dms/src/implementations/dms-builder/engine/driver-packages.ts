import { createRequire } from "node:module";
import path from "node:path";
import type {
  DatabaseEngine,
  DriverPackage,
} from "@antelopejs/interface-dms-builder";
import semver from "semver";
import { z } from "zod";
import { DATABASE_ENGINES } from "./database-access";
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
 * The releases of each driver with external mode, by the `@antelopejs/interface-database` range
 * each one's own dependency names, oldest first. A project on another line of the interface gets
 * a range of its own segments only: a release for another line fails to resolve. Moving the DMS
 * to another line of the interface, or a driver release, means updating this table only.
 */
const DRIVERS: Record<DatabaseEngine, Driver> = {
  postgres: {
    package: "@antelopejs/postgres",
    segments: [
      { from: "0.2.5", interfaceDatabase: ">=0.3.0 <0.4.0" },
      { from: "0.2.6", interfaceDatabase: ">=0.3.1 <0.4.0" },
      { from: "0.3.0", interfaceDatabase: ">=0.3.3 <0.4.0" },
      { from: "0.4.0", interfaceDatabase: ">=0.4.0 <0.5.0" },
    ],
  },
  mysql: {
    package: "@antelopejs/mysql",
    segments: [{ from: "0.1.0", interfaceDatabase: ">=0.3.1 <0.4.0" }],
  },
  mongodb: {
    package: "@antelopejs/mongodb",
    segments: [
      { from: "1.6.2", interfaceDatabase: ">=0.3.0 <0.4.0" },
      { from: "1.6.3", interfaceDatabase: ">=0.3.1 <0.4.0" },
      { from: "1.8.0", interfaceDatabase: ">=0.4.0 <0.5.0" },
    ],
  },
  rethinkdb: {
    package: "@antelopejs/rethinkdb",
    segments: [
      { from: "1.7.0", interfaceDatabase: ">=0.3.0 <0.4.0" },
      { from: "1.7.1", interfaceDatabase: ">=0.3.1 <0.4.0" },
      { from: "1.9.0", interfaceDatabase: ">=0.3.3 <0.4.0" },
      { from: "1.10.0", interfaceDatabase: ">=0.4.0 <0.5.0" },
    ],
  },
};

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
        createRequire(base)("@antelopejs/interface-database/package.json"),
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
  for (const engine of DATABASE_ENGINES) {
    const version = rangeFor(DRIVERS[engine], interfaceDatabase);
    if (version) {
      drivers[engine] = { package: DRIVERS[engine].package, version };
    }
  }
  return drivers;
}
