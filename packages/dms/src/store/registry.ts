import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PackageRelease } from "./types";

const execFileAsync = promisify(execFile);

const RELEASE_TTL_MS = 60 * 60 * 1000;
/** A failed lookup is retried sooner: the registry may only have blinked. */
const FAILED_RELEASE_TTL_MS = 5 * 60 * 1000;
const NPM_VIEW_TIMEOUT_MS = 30_000;
const LATEST_TAG = "latest";
export const INTERFACE_PACKAGE = "@antelopejs/interface-dms";

interface NpmViewResult {
  version?: string;
  dependencies?: Record<string, string>;
}

interface CachedRelease {
  fetchedAt: number;
  release: PackageRelease | undefined;
}

const releases = new Map<string, CachedRelease>();
const pending = new Map<string, Promise<PackageRelease | undefined>>();

async function viewLatest(
  packageName: string,
  projectPath: string,
): Promise<PackageRelease | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "npm",
      [
        "view",
        `${packageName}@${LATEST_TAG}`,
        "version",
        "dependencies",
        "--json",
      ],
      { cwd: projectPath, timeout: NPM_VIEW_TIMEOUT_MS },
    );
    const view = JSON.parse(stdout) as NpmViewResult;
    if (!view.version) return undefined;
    return {
      version: view.version,
      interfaceRange: view.dependencies?.[INTERFACE_PACKAGE],
    };
  } catch {
    return undefined;
  }
}

function isFresh(cached: CachedRelease | undefined): boolean {
  if (!cached) return false;
  const ttl = cached.release ? RELEASE_TTL_MS : FAILED_RELEASE_TTL_MS;
  return Date.now() - cached.fetchedAt < ttl;
}

/**
 * The latest release of `packageName`, read with the project's npm
 * configuration so a private registry and its credentials apply. Cached for an
 * hour; undefined when the registry cannot say.
 */
export function latestRelease(
  packageName: string,
  projectPath: string,
  force = false,
): Promise<PackageRelease | undefined> {
  const cached = releases.get(packageName);
  if (!force && isFresh(cached)) {
    return Promise.resolve(cached?.release);
  }
  const inFlight = pending.get(packageName);
  if (inFlight) return inFlight;
  const lookup = viewLatest(packageName, projectPath)
    .then((release) => {
      releases.set(packageName, { fetchedAt: Date.now(), release });
      return release;
    })
    .finally(() => pending.delete(packageName));
  pending.set(packageName, lookup);
  return lookup;
}
