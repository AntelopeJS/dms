import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createLookupCache, type Freshness } from "./cache";
import type { PackageRelease } from "./types";

const execFileAsync = promisify(execFile);

const RELEASE_LIFETIMES = { found: 60 * 60 * 1000, failed: 5 * 60 * 1000 };
const NPM_VIEW_TIMEOUT_MS = 30_000;
const LATEST_TAG = "latest";
export const INTERFACE_PACKAGE = "@antelopejs/interface-dms";

interface NpmViewResult {
  version?: string;
  dependencies?: Record<string, string>;
  antelopeJs?: { implements?: unknown };
}

const releases = createLookupCache<PackageRelease>(RELEASE_LIFETIMES);

/**
 * `npm view <spec> <fields> --json`, run in the project so its npm
 * configuration (private registry, credentials) applies. Undefined when the
 * registry has nothing to say.
 */
export async function npmView(
  spec: string,
  fields: readonly string[],
  projectPath: string,
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Answers the JSON npm view --json prints for the fields asked, read as npm prints it, and each caller reads its own fields (the antelopejs#367 package.ts class).
): Promise<unknown> {
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
  // SAFETY: npm view --json answers the requested fields, the version and dependencies as strings and antelopeJs as the package's own field; a malformed registry answer is read unchecked and surfaces as a missing version or odd fields in the release.
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

/**
 * The latest release of `packageName`, read with the project's npm
 * configuration so a private registry and its credentials apply. Cached for an
 * hour; undefined when the registry cannot say.
 */
export function latestRelease(
  packageName: string,
  projectPath: string,
  freshness: Freshness,
): Promise<PackageRelease | undefined> {
  return releases.get(packageName, () => viewLatest(packageName, projectPath), {
    freshness,
  });
}
