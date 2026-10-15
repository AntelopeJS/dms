import { readFileSync } from "node:fs";
import path from "node:path";
import { satisfies, validRange } from "semver";
import { INTERFACE_PACKAGE } from "./registry";
import type { PackageRelease } from "./types";

const PACKAGE_JSON = "package.json";
const INTERFACE_ENTRY = `${INTERFACE_PACKAGE}/page`;

interface PackageManifest {
  name?: string;
  version?: string;
}

let interfaceVersion: string | undefined;

function readManifest(folder: string): PackageManifest | undefined {
  try {
    return JSON.parse(
      readFileSync(path.join(folder, PACKAGE_JSON), "utf-8"),
    ) as PackageManifest;
  } catch {
    return undefined;
  }
}

/**
 * The version of the `@antelopejs/interface-dms` copy this process runs, the
 * one every module shares. Its `package.json` is not exported, so it is found
 * by walking up from a file that is.
 */
export function installedInterfaceVersion(): string {
  if (interfaceVersion) return interfaceVersion;
  let folder = path.dirname(require.resolve(INTERFACE_ENTRY));
  while (folder !== path.dirname(folder)) {
    const manifest = readManifest(folder);
    if (manifest?.name === INTERFACE_PACKAGE && manifest.version) {
      interfaceVersion = manifest.version;
      return interfaceVersion;
    }
    folder = path.dirname(folder);
  }
  throw new Error(`Cannot find the installed ${INTERFACE_PACKAGE} version`);
}

/**
 * Whether a release can load next to the installed interface: the core
 * refuses a module whose interface range the shared copy does not satisfy.
 * A release that names no range, or an unreadable one, is not held back.
 */
export function isCompatible(
  release: PackageRelease,
  installedVersion: string,
): boolean {
  const range = release.interfaceRange
    ? validRange(release.interfaceRange)
    : null;
  if (!range) return true;
  return satisfies(installedVersion, range, { includePrerelease: true });
}
