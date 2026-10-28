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
  antelopeJs?: { implements?: unknown };
}

interface CachedRelease {
  fetchedAt: number;
  release: PackageRelease | undefined;
}

const releases = new Map<string, CachedRelease>();
const pending = new Map<string, Promise<PackageRelease | undefined>>();

/**
 * `npm view <spec> <fields> --json`, run in the project so its npm
 * configuration (private registry, credentials) applies. Undefined when the
 * registry has nothing to say.
 */
export async function npmView(
  spec: string,
  fields: readonly string[],
  projectPath: string,
) {
  try {
    const { stdout } = await execFileAsync(
      "npm",
      ["view", spec, ...fields, "--json"],
      { cwd: projectPath, timeout: NPM_VIEW_TIMEOUT_MS },
    );
    const view: unknown = stdout.trim() ? JSON.parse(stdout) : undefined;
    return view;
  } catch {
    return undefined;
  }
}

async function viewLatest(
  packageName: string,
  projectPath: string,
): Promise<PackageRelease | undefined> {
  // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion -- The selected npm fields are historically trusted without schema validation; preserve malformed-registry behavior.
  const view = (await npmView(
    `${packageName}@${LATEST_TAG}`,
    ["version", "dependencies", "antelopeJs"],
    projectPath,
  )) as NpmViewResult | undefined;
  if (!view?.version) return undefined;
  return {
    version: view.version,
    interfaceRange: view.dependencies?.[INTERFACE_PACKAGE],
    dependencies: view.dependencies ?? {},
    implements: Array.isArray(view.antelopeJs?.implements)
      ? view.antelopeJs.implements.map(String)
      : [],
  };
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
