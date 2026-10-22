import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { RequestContext } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetRuntimeInfo } from "@antelopejs/interface-core/runtime";
import type {
  AddFrontendModuleOptions,
  FrontendBackendProxy,
  FrontendModuleMetadata,
  FrontendPublicEndpoint,
  FrontendModuleOptions,
  FrontendModuleValue,
} from "@antelopejs/interface-dms/page";
import { FrontendModulesChanged } from "@antelopejs/interface-dms/page";
import { coerce, major } from "semver";
import { getConfig, setDevApiBaseUrl, setDevClientBaseUrl } from "../../config";
import { scheduleBroadcast } from "./dev-reload";
import {
  assertFrontendBootstrap,
  type BootstrapOutcome,
  decideLayerAccess,
  degradedLayerAccessWarning,
  resolveBootstrapOutcome,
} from "./frontend-bootstrap";
import {
  applyDevManifestUrls,
  FRONTEND_MANIFEST_VERSION,
  type FrontendManifest,
  type ManifestFieldPolicy,
  type ManifestModuleEntry,
  listDroppedBackendProxies,
  type ModuleManifestShape,
  resolveClientOrigin,
  resolveRequestOrigin,
  stripPrivateManifestFields,
} from "./manifest";
import { isStoreOperationRunning } from "../../store/activity";
import { warnOnceFor } from "./warn-once";
import {
  copyPublicEndpoints,
  resolvePublicEndpoints,
} from "./frontend-public-endpoints";
import {
  copyBackendProxies,
  resolveBackendProxies,
} from "./frontend-backend-proxies";

interface FrontendModule {
  name: string;
  path: string;
  priority: number;
  options?: FrontendModuleOptions;
  privateOptions?: FrontendModuleOptions;
  configKey?: string;
  renderer: AddFrontendModuleOptions["renderer"];
  authEstablishEndpoints: string[];
  publicEndpoints: Required<FrontendPublicEndpoint>[];
  backendProxies: Required<FrontendBackendProxy>[];
  /** Version of the package shipping it, `undefined` when unreadable. */
  packageVersion?: string;
}

interface FrontendSelection {
  renderer: string;
  rendererVersion: string;
  rendererMajor: number;
}

type ServedModule = Omit<
  FrontendModule,
  "path" | "authEstablishEndpoints" | "publicEndpoints" | "backendProxies"
> & {
  path?: string;
  authEstablishEndpoints?: string[];
  publicEndpoints?: Required<FrontendPublicEndpoint>[];
  backendProxies?: Required<FrontendBackendProxy>[];
};

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
const modules: Record<string, FrontendModule> = {};

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
  const identity = moduleIdentity(config);
  const authEstablishEndpoints = resolveAuthEstablishEndpoints(config);
  const publicEndpoints = resolvePublicEndpoints(config);
  const backendProxies = resolveBackendProxies(config);
  const registeredModule = modules[identity];
  if (registeredModule && registeredModule.priority > (config.priority ?? 0)) {
    return;
  }
  modules[identity] = {
    name: config.name,
    path: config.sourcePath,
    priority: config.priority ?? 0,
    options: config.options || {},
    privateOptions: config.privateOptions || {},
    configKey: config.configKey,
    renderer: config.renderer,
    authEstablishEndpoints,
    publicEndpoints,
    backendProxies,
    packageVersion: shippingPackageVersion(config.sourcePath),
  };
  scheduleBroadcast();
  FrontendModulesChanged.emit();
}

/**
 * The version of the package a frontend module ships in, read from the
 * package.json above its source directory, as `@antelopejs/dms-frontend`
 * reads it when it reports what it serves.
 */
function shippingPackageVersion(sourcePath: string): string | undefined {
  try {
    const manifest = JSON.parse(
      readFileSync(join(dirname(sourcePath), "package.json"), "utf-8"),
    ) as { version?: unknown };
    return typeof manifest.version === "string" ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

/** The package version of each registered frontend module, by name. */
export function frontendModuleVersions(): Map<string, string | undefined> {
  return new Map(
    Object.values(modules).map((module) => [
      module.name,
      module.packageVersion,
    ]),
  );
}

function isInsideFolder(candidate: string, folder: string): boolean {
  const relativePath = relative(folder, candidate);
  return !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

/** Names of the frontend modules whose sources live under `folder`. */
export function frontendModuleNamesUnder(folder: string): string[] {
  return Object.values(modules)
    .filter((module) => isInsideFolder(module.path, folder))
    .map((module) => module.name);
}

/**
 * Drops the frontend modules whose sources live under `folder`, the folder of
 * a module the store just took down. `AddFrontendModule` is a plain interface
 * function, not a registering proxy, so nothing else releases a destroyed
 * module's layer: it would stay in the manifest until the process restarts.
 *
 * @returns The names of the dropped frontend modules
 */
export function removeFrontendModulesUnder(folder: string): string[] {
  const removed = Object.entries(modules).filter(([, module]) =>
    isInsideFolder(module.path, folder),
  );
  for (const [identity] of removed) {
    delete modules[identity];
  }
  if (removed.length > 0) {
    scheduleBroadcast();
    FrontendModulesChanged.emit();
  }
  return removed.map(([, module]) => module.name);
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
    publicEndpoints: copyPublicEndpoints(module.publicEndpoints),
    backendProxies: copyBackendProxies(module.backendProxies),
  }));
}

function enforceLayerAccess(
  outcome: BootstrapOutcome,
  route: string,
  droppedProxies: () => string[] = () => [],
): void {
  const decision = decideLayerAccess(outcome);
  if (decision === "allow") return;
  if (decision === "refuse") assertFrontendBootstrap(outcome);
  const dropped = droppedProxies();
  warnOnceFor(
    modules,
    `${route} ${dropped.join(",")}`,
    degradedLayerAccessWarning(route, dropped),
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
  const apiOrigin = resolveRequestOrigin(requestContext.rawRequest);
  // Only a trusted dev server moves the origins every module builds links on.
  if (outcome === "authenticated") {
    if (clientOrigin) setDevClientBaseUrl(clientOrigin);
    if (apiOrigin) setDevApiBaseUrl(apiOrigin);
  }
  return applyDevManifestUrls(
    manifest,
    { apiBaseUrl: config.apiBaseUrl, clientBaseUrl: config.clientBaseUrl },
    { apiBaseUrl: apiOrigin, clientBaseUrl: clientOrigin },
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
  // Refused before the selection is read: an anonymous caller learns nothing
  // of the renderers served.
  enforceLayerAccess(outcome, "GET /dms/frontend", () =>
    listDroppedBackendProxies(
      selectedModules(resolveFrontendSelection(renderer, rendererVersion)),
      resolveManifestFieldPolicy(outcome, false),
    ),
  );
  const selection = resolveFrontendSelection(renderer, rendererVersion);
  const { dev } = await GetRuntimeInfo();
  let shaped: ModuleManifestShape<ServedModule> = stripPrivateManifestFields(
    { modules: selectedModules(selection) },
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
  return {
    version: FRONTEND_MANIFEST_VERSION,
    modules: shaped.modules,
    settling: isStoreOperationRunning(),
  };
}
