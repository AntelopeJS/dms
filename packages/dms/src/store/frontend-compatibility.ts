import { readFileSync } from "node:fs";
import path from "node:path";
import { coerce, maxSatisfying, satisfies, validRange } from "semver";
import { GetFrontendModules } from "../implementations/dms/frontend-modules";
import { getFrontendAcknowledgement } from "../implementations/dms/frontend-ready";
import { createLookupCache } from "./cache";
import { npmView } from "./registry";
import { readPublishedFiles } from "./tarball";
import type {
  FrontendBreak,
  FrontendRequirement,
  FrontendVersionSource,
} from "./types";

export const FRONTEND_PACKAGE = "@antelopejs/dms-frontend";
/**
 * Where a module ships its frontend layer, and so the package.json whose
 * `engines` dms-frontend reads to refuse a release it does not support.
 */
const LAYER_MANIFEST = "frontend-vue/package.json";
const PACKAGE_JSON = "package.json";
const HOUR_MS = 60 * 60 * 1000;
const FAILED_LOOKUP_MS = 5 * 60 * 1000;
/** A published release never changes: its range is kept for the process. */
const RELEASE_RANGE_LIFETIMES = { found: Infinity, failed: FAILED_LOOKUP_MS };
const VERSIONS_LIFETIMES = { found: HOUR_MS, failed: FAILED_LOOKUP_MS };

interface PackageManifest {
  version?: string;
  engines?: Record<string, unknown>;
}

/** The dms-frontend version that runs, and where the store read it. */
export interface RunningFrontend {
  version: string;
  source: FrontendVersionSource;
}

/** A release's declared range; `null` when it ships no layer or no range. */
type DeclaredRange = string | null;

const releaseRanges = createLookupCache<DeclaredRange>(RELEASE_RANGE_LIFETIMES);
const publishedVersions = createLookupCache<string[]>(VERSIONS_LIFETIMES);

function readManifest(file: string): PackageManifest | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as PackageManifest;
  } catch {
    return undefined;
  }
}

function engineRange(manifest: PackageManifest | undefined): DeclaredRange {
  const range = manifest?.engines?.[FRONTEND_PACKAGE];
  return typeof range === "string" && validRange(range) ? range : null;
}

/**
 * The dms-frontend range `packageName@version` supports, read from its
 * published archive: the file dms-frontend itself reads. Null when the
 * release ships no frontend layer or declares no range; undefined when the
 * archive cannot be read.
 */
export function releaseFrontendRange(
  packageName: string,
  version: string,
  projectPath: string,
): Promise<DeclaredRange | undefined> {
  return releaseRanges.get(`${packageName}@${version}`, async () => {
    const files = await readPublishedFiles(packageName, version, projectPath, [
      LAYER_MANIFEST,
    ]);
    const manifest = files.get(LAYER_MANIFEST);
    return manifest
      ? engineRange(JSON.parse(manifest) as PackageManifest)
      : null;
  });
}

/**
 * The dms-frontend that runs: the version the frontend server reported when
 * it became ready, or else the one installed in the project, right when the
 * frontend runs from the same checkout.
 */
export function runningFrontend(
  projectPath: string,
): RunningFrontend | undefined {
  const reported = getFrontendAcknowledgement()?.version;
  if (reported) return { version: reported, source: "reported" };
  const installed = readManifest(
    path.join(projectPath, "node_modules", FRONTEND_PACKAGE, PACKAGE_JSON),
  )?.version;
  return installed ? { version: installed, source: "project" } : undefined;
}

/**
 * Whether `version` is in `range` the way dms-frontend checks it: a
 * prerelease counts as the release it leads to.
 */
export function supportsFrontend(range: string, version: string): boolean {
  const line = coerce(version)?.version ?? version;
  return satisfies(line, range);
}

function listPublishedVersions(
  projectPath: string,
): Promise<string[] | undefined> {
  return publishedVersions.get(FRONTEND_PACKAGE, async () => {
    const versions = await npmView(FRONTEND_PACKAGE, ["versions"], projectPath);
    return Array.isArray(versions) ? versions.map(String) : undefined;
  });
}

/**
 * Loaded frontend layers that `version` would refuse, leaving out those under
 * `replacedFolder`, the module about to be replaced.
 */
function layersRefusing(
  version: string,
  replacedFolder: string | undefined,
): FrontendBreak[] {
  const isReplaced = (sourcePath: string): boolean =>
    replacedFolder !== undefined &&
    !path.relative(replacedFolder, sourcePath).startsWith("..");
  return GetFrontendModules()
    .filter((layer) => !isReplaced(layer.sourcePath))
    .flatMap((layer) => {
      const range = engineRange(
        readManifest(path.join(layer.sourcePath, PACKAGE_JSON)),
      );
      return range && !supportsFrontend(range, version)
        ? [{ name: layer.name, range }]
        : [];
    });
}

/** What a release whose range excludes the running dms-frontend needs. */
export interface FrontendRequirementInput {
  range: string;
  running: string;
  projectPath: string;
  /** Folder of the installed copy the release replaces, on an update. */
  replacedFolder?: string;
}

/**
 * Undefined when the release supports the running dms-frontend; otherwise
 * the newest published dms-frontend it supports, the command to move to it,
 * and the loaded layers that release would refuse.
 */
export async function frontendRequirement(
  input: FrontendRequirementInput,
): Promise<FrontendRequirement | undefined> {
  if (supportsFrontend(input.range, input.running)) return undefined;
  const versions = (await listPublishedVersions(input.projectPath)) ?? [];
  const target = maxSatisfying(versions, input.range) ?? undefined;
  return {
    range: input.range,
    running: input.running,
    target,
    command: target ? `pnpm add -D ${FRONTEND_PACKAGE}@${target}` : undefined,
    breaks: target ? layersRefusing(target, input.replacedFolder) : [],
  };
}
