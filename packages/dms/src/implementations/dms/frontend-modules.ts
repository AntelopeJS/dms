import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PassThrough } from "node:stream";
import { buffer } from "node:stream/consumers";
import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import type {
  AddFrontendModuleOptions,
  FrontendModuleMetadata,
  FrontendModuleOptions,
  FrontendModuleValue,
} from "@antelopejs/interface-dms/page";
import archiver from "archiver";
import ignore from "ignore";
import { coerce, major } from "semver";
import { getConfig, setDevClientBaseUrl } from "../../config";
import { scheduleBroadcast } from "./dev-reload";
import {
  assertFrontendBootstrap,
  type BootstrapOutcome,
  decideLayerAccess,
  resolveBootstrapOutcome,
} from "./frontend-bootstrap";
import {
  applyDevManifestUrls,
  type FrontendManifest,
  type ManifestFieldPolicy,
  type ManifestModuleEntry,
  type ModuleManifestShape,
  resolveClientOrigin,
  resolveRequestOrigin,
  stripPrivateManifestFields,
} from "./manifest";
import { warnOnceFor } from "./warn-once";

interface FrontendModule {
  name: string;
  archiveName: string;
  path: string;
  priority: number;
  options?: FrontendModuleOptions;
  privateOptions?: FrontendModuleOptions;
  configKey?: string;
  renderer: AddFrontendModuleOptions["renderer"];
  authEstablishEndpoints: string[];
}

interface FrontendSelection {
  renderer: string;
  rendererVersion: string;
  rendererMajor: number;
}

type ServedModule = Omit<FrontendModule, "path" | "authEstablishEndpoints"> & {
  path?: string;
  authEstablishEndpoints?: string[];
};

const BUILD_ARTIFACT_PATTERNS = [
  "node_modules/",
  "dist/",
  ".output/",
  ".next/",
  "*.log",
  ".DS_Store",
  "tsconfig.json",
  "tsconfig.*.json",
];
const SECRET_BEARING_PATTERNS = [
  ".git/",
  ".env*",
  "*.pem",
  "*.key",
  "*.crt",
  "*.cer",
  "*.der",
  "*.p12",
  "*.pfx",
  "*.jks",
  "*.keystore",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "*.ppk",
  "credentials*.json",
  "secrets*",
  "*.secret",
  "*.secrets",
  ".npmrc",
  ".netrc",
  ".pgpass",
];
/**
 * Absolute backend API paths only: no scheme, no authority, no query string,
 * and no segment that could climb out of `/api/`. Kept character-for-character
 * in sync with the frontend server's own grammar, which re-checks every path
 * it is asked to open a session from.
 */
const BACKEND_API_PATH =
  /^\/api\/[A-Za-z0-9][A-Za-z0-9._~-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~-]*)*$/;

const DEFAULT_RENDERER = "vue";
const DEFAULT_RENDERER_VERSION = "3";
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const cachedModulesArchives = new Map<string, Promise<Buffer>>();
const modules: Record<string, FrontendModule> = {};

export function createIgnoreFilter(modulePath: string) {
  const filter = ignore();
  const gitignorePath = join(modulePath, ".gitignore");
  if (existsSync(gitignorePath)) {
    filter.add(readFileSync(gitignorePath, "utf-8"));
  }
  filter.add([...BUILD_ARTIFACT_PATTERNS, ...SECRET_BEARING_PATTERNS]);
  return (entryData: any) => {
    if (filter.ignores(entryData.name)) return false;
    return entryData;
  };
}

function rendererMajor(version: string): number | null {
  const parsedVersion = coerce(version);
  return parsedVersion ? major(parsedVersion) : null;
}

function moduleIdentity(config: AddFrontendModuleOptions): string {
  const versionMajor = rendererMajor(config.renderer.version);
  assert(
    versionMajor !== null,
    HTTP_BAD_REQUEST,
    "error.frontend_renderer_version_invalid",
  );
  return [config.name, config.renderer.name, versionMajor].join("\0");
}

function resolveFrontendSelection(
  renderer: string | undefined,
  rendererVersion: string | undefined,
): FrontendSelection {
  const hasExplicitSelection =
    renderer !== undefined || rendererVersion !== undefined;
  assert(
    !hasExplicitSelection || Boolean(renderer && rendererVersion),
    HTTP_BAD_REQUEST,
    "error.frontend_renderer_selection_required",
  );
  const selectedVersion = rendererVersion ?? DEFAULT_RENDERER_VERSION;
  const selectedMajor = rendererMajor(selectedVersion);
  assert(
    selectedMajor !== null,
    HTTP_BAD_REQUEST,
    "error.frontend_renderer_version_invalid",
  );
  return {
    renderer: renderer ?? DEFAULT_RENDERER,
    rendererVersion: selectedVersion,
    rendererMajor: selectedMajor,
  };
}

function sortedModules(): FrontendModule[] {
  return Object.values(modules).sort(
    (left, right) =>
      left.priority - right.priority || left.name.localeCompare(right.name),
  );
}

function selectedModules(selection: FrontendSelection): FrontendModule[] {
  const compatibleModules = sortedModules().filter((module) => {
    return (
      module.renderer.name === selection.renderer &&
      rendererMajor(module.renderer.version) === selection.rendererMajor
    );
  });
  assert(
    compatibleModules.length > 0,
    HTTP_NOT_FOUND,
    "error.frontend_renderer_not_found",
  );
  return compatibleModules;
}

function selectionKey(selection: FrontendSelection): string {
  return `${selection.renderer}:${selection.rendererMajor}`;
}

async function createModuleArchive(
  selection: FrontendSelection,
): Promise<void> {
  const archive = archiver("zip");
  for (const module of selectedModules(selection)) {
    archive.directory(
      module.path,
      module.archiveName,
      createIgnoreFilter(module.path),
    );
  }
  const bufferPromise = buffer(archive);
  await archive.finalize();
  cachedModulesArchives.set(selectionKey(selection), bufferPromise);
}

/**
 * The session-opening endpoints a module declares, checked and de-duplicated.
 *
 * The frontend server turns each of these into a route the browser may ask it
 * to log in through, so a malformed declaration is a registration error rather
 * than something to drop silently: the module would otherwise start, and its
 * flow would only fail at the point a visitor tries to finish signing up.
 *
 * The DMS's own login, signup and 2FA routes are wired into the frontend
 * server directly and must not be declared here.
 *
 * @param config Module registration as the module wrote it
 * @returns The declared endpoints, in declaration order, without duplicates
 */
function resolveAuthEstablishEndpoints(
  config: AddFrontendModuleOptions,
): string[] {
  const declared = config.authEstablishEndpoints ?? [];
  const invalid = declared.filter(
    (endpoint) =>
      typeof endpoint !== "string" || !BACKEND_API_PATH.test(endpoint),
  );
  if (invalid.length > 0) {
    throw new Error(
      `Frontend module "${config.name}" declares invalid authEstablishEndpoints: ` +
        `${invalid.map((endpoint) => JSON.stringify(endpoint)).join(", ")}. ` +
        "Each entry must be an absolute backend API path under /api/, with no " +
        "query string and no segment that climbs out of it.",
    );
  }
  return [...new Set(declared)];
}

export function AddFrontendModule(config: AddFrontendModuleOptions): void {
  cachedModulesArchives.clear();
  const identity = moduleIdentity(config);
  const authEstablishEndpoints = resolveAuthEstablishEndpoints(config);
  const registeredModule = modules[identity];
  if (registeredModule && registeredModule.priority > (config.priority ?? 0)) {
    return;
  }
  modules[identity] = {
    name: config.name,
    archiveName: config.name.replaceAll(/[/]/g, "-"),
    path: config.sourcePath,
    priority: config.priority ?? 0,
    options: config.options || {},
    privateOptions: config.privateOptions || {},
    configKey: config.configKey,
    renderer: config.renderer,
    authEstablishEndpoints,
  };
  scheduleBroadcast();
}

function copyFrontendValue(value: FrontendModuleValue): FrontendModuleValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(copyFrontendValue);
  return copyFrontendOptions(value);
}

function copyFrontendOptions(
  options: FrontendModuleOptions,
): FrontendModuleOptions {
  return Object.fromEntries(
    Object.entries(options).map(([key, value]) => [
      key,
      copyFrontendValue(value),
    ]),
  );
}

/** Returns an isolated snapshot of registered frontend sources without private configuration. */
export function GetFrontendModules(): FrontendModuleMetadata[] {
  return sortedModules().map((module) => ({
    name: module.name,
    sourcePath: module.path,
    renderer: { name: module.renderer.name, version: module.renderer.version },
    priority: module.priority,
    options: copyFrontendOptions(module.options ?? {}),
    authEstablishEndpoints: [...module.authEstablishEndpoints],
  }));
}

function enforceLayerAccess(outcome: BootstrapOutcome, route: string): void {
  const decision = decideLayerAccess(outcome);
  if (decision === "allow") return;
  if (decision === "refuse") assertFrontendBootstrap(outcome);
  warnOnceFor(
    modules,
    route,
    `[DMS] ${route} was served to a caller presenting no valid bootstrap credential, ` +
      "because this instance configures none. Private layer options were withheld, so " +
      "server-side HTML rendering and OAuth login will fail in a frontend built from this " +
      "response. Set frontend.bootstrapSecret in the backend config and DMS_BOOTSTRAP_SECRET " +
      "where the frontend is built; the route is then refused to unauthenticated callers.",
  );
}

function resolveManifestFieldPolicy(
  outcome: BootstrapOutcome,
  dev: boolean,
): ManifestFieldPolicy {
  const authenticated = outcome === "authenticated";
  return {
    privateOptions: authenticated,
    path: authenticated && dev,
    authEstablishEndpoints: authenticated,
  };
}

function applyDevManifestOverrides<T extends ManifestModuleEntry>(
  manifest: ModuleManifestShape<T>,
  requestContext: RequestContext,
  clientUrl: string | undefined,
  outcome: BootstrapOutcome,
): ModuleManifestShape<T> {
  const config = getConfig();
  const clientOrigin = resolveClientOrigin(clientUrl);
  if (clientOrigin && outcome === "authenticated") {
    setDevClientBaseUrl(clientOrigin);
  }
  return applyDevManifestUrls(
    manifest,
    { apiBaseUrl: config.apiBaseUrl, clientBaseUrl: config.clientBaseUrl },
    {
      apiBaseUrl: resolveRequestOrigin(requestContext.rawRequest),
      clientBaseUrl: clientOrigin,
    },
  );
}

export async function buildFrontendManifest(
  requestContext: RequestContext,
  clientUrl: string | undefined,
  renderer: string | undefined,
  rendererVersion: string | undefined,
  bootstrapHeader: string | undefined,
): Promise<FrontendManifest<ServedModule>> {
  const outcome = resolveBootstrapOutcome(bootstrapHeader);
  enforceLayerAccess(outcome, "GET /dms/frontend");
  const selection = resolveFrontendSelection(renderer, rendererVersion);
  const { dev } = await GetRuntimeInfo();
  let shaped: ModuleManifestShape<ServedModule> = stripPrivateManifestFields(
    {
      pack:
        `/dms/frontend/modules?renderer=${encodeURIComponent(selection.renderer)}` +
        `&rendererVersion=${encodeURIComponent(selection.rendererVersion)}`,
      modules: selectedModules(selection),
    },
    resolveManifestFieldPolicy(outcome, dev),
  );
  if (dev) {
    shaped = applyDevManifestOverrides(
      shaped,
      requestContext,
      clientUrl,
      outcome,
    );
  }
  return { version: 1, archive: shaped.pack, modules: shaped.modules };
}

export async function writeFrontendModules(
  out: PassThrough,
  renderer: string | undefined,
  rendererVersion: string | undefined,
  bootstrapHeader: string | undefined,
): Promise<void> {
  enforceLayerAccess(
    resolveBootstrapOutcome(bootstrapHeader),
    "GET /dms/frontend/modules",
  );
  const selection = resolveFrontendSelection(renderer, rendererVersion);
  const key = selectionKey(selection);
  if (
    !cachedModulesArchives.has(key) ||
    process.env.NODE_ENV !== "production"
  ) {
    await createModuleArchive(selection);
  }
  out.end(await cachedModulesArchives.get(key));
}
