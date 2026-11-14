import {
  isObject,
  isString,
} from "@antelopejs/interface-dms/utils/internal/type-check";
import { runPackageManager } from "../utils/package-manager/index";
import { createLookupCache, type Freshness } from "./cache";
import type { PackageRelease } from "./types";

const RELEASE_LIFETIMES = { found: 60 * 60 * 1000, failed: 5 * 60 * 1000 };
const NPM_VIEW_TIMEOUT_MS = 30_000;
const LATEST_TAG = "latest";
export const INTERFACE_PACKAGE = "@antelopejs/interface-dms";

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value) && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(isString);
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
    const { stdout } = await runPackageManager(
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
  const view = await npmView(
    `${packageName}@${LATEST_TAG}`,
    ["version", "dependencies", "antelopeJs"],
    projectPath,
  );
  if (!isRecord(view) || !isString(view.version) || !view.version) {
    return undefined;
  }
  const dependencies = isStringRecord(view.dependencies)
    ? view.dependencies
    : undefined;
  const implemented = isRecord(view.antelopeJs)
    ? view.antelopeJs.implements
    : undefined;
  return {
    version: view.version,
    interfaceRange: dependencies?.[INTERFACE_PACKAGE],
    dependencies: dependencies ?? {},
    implements: Array.isArray(implemented) ? implemented.map(String) : [],
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
