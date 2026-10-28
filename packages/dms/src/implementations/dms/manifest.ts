import type { IncomingMessage } from "node:http";

export interface ManifestModuleEntry {
  options?: Record<string, unknown>;
  privateOptions?: Record<string, unknown>;
  path?: string;
  authEstablishEndpoints?: string[];
  publicEndpoints?: unknown[];
  backendProxies?: unknown[];
}

export interface ModuleManifestShape<
  T extends ManifestModuleEntry = ManifestModuleEntry,
> {
  modules: T[];
}

/**
 * Version 2 dropped the layers archive: a frontend build reads the modules
 * from the project's packages, and only `ajs dms dev` reads this manifest.
 */
export const FRONTEND_MANIFEST_VERSION = 2;

export interface FrontendManifest<T extends ManifestModuleEntry> {
  version: number;
  modules: T[];
  /**
   * True while the module store changes the set of loaded modules: a
   * frontend following the set waits for it to settle before rebuilding.
   */
  settling?: boolean;
  /**
   * In development, the origins substituted in every module's options:
   * `ajs dms dev` computes the options from the project, as a build does,
   * and applies the same substitution to them.
   */
  originRewrites?: OriginRewrite[];
}

export interface ManifestUrls {
  apiBaseUrl?: string;
  clientBaseUrl?: string;
}

/** A configured origin, and the one a dev frontend reaches it on. */
export interface OriginRewrite {
  from: string;
  to: string;
}

/**
 * The configured api and client base URLs a development manifest replaces,
 * each with the override given for it.
 */
export function devOriginRewrites(
  configured: ManifestUrls,
  overrides: ManifestUrls,
): OriginRewrite[] {
  const keys = ["apiBaseUrl", "clientBaseUrl"] as const;
  return keys.flatMap((key) => {
    const from = configured[key];
    const to = overrides[key];
    return from && to ? [{ from, to }] : [];
  });
}

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

interface PossiblyEncryptedSocket {
  encrypted?: boolean;
}

export function resolveRequestOrigin(
  request: IncomingMessage,
): string | undefined {
  const host = request.headers.host;
  if (!host) return undefined;
  const socket = request.socket as PossiblyEncryptedSocket;
  const protocol = socket.encrypted ? "https" : "http";
  return `${protocol}://${host}`;
}

export function resolveClientOrigin(
  clientUrl: string | undefined,
): string | undefined {
  if (!clientUrl) return undefined;
  try {
    const url = new URL(clientUrl);
    if (!HTTP_PROTOCOLS.has(url.protocol)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

type OriginRewriter = (value: string) => string;

const URL_BOUNDARY = "(?=[/?#]|$)";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildOriginRewriter(
  configured: ManifestUrls,
  overrides: ManifestUrls,
): OriginRewriter | undefined {
  const replacements = new Map(
    devOriginRewrites(configured, overrides).map(({ from, to }) => [from, to]),
  );
  if (replacements.size === 0) return undefined;

  const alternation = [...replacements.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const pattern = new RegExp(`(?:${alternation})${URL_BOUNDARY}`, "g");
  return (value) =>
    value.replace(pattern, (match) => replacements.get(match) ?? match);
}

function rewriteValue(value: unknown, rewrite: OriginRewriter): unknown {
  if (typeof value === "string") return rewrite(value);
  if (Array.isArray(value))
    return value.map((item) => rewriteValue(item, rewrite));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewriteValue(item, rewrite),
      ]),
    );
  }
  return value;
}

function rewriteModuleOptions<T extends ManifestModuleEntry>(
  module: T,
  rewrite: OriginRewriter,
): T {
  if (!module.options) return module;
  return {
    ...module,
    options: rewriteValue(module.options, rewrite) as Record<string, unknown>,
  };
}

/**
 * Rewrite the URLs served in the frontend manifest for development mode.
 *
 * Any string in a module's options that contains the configured api or client
 * base URL (at any key, any depth) has that origin substituted with the
 * provided override, so a dev frontend always receives URLs that are reachable
 * from where it fetched the manifest. Substitution is origin-boundary aware:
 * only whole origins are replaced, derived URLs like `${apiBaseUrl}/api` keep
 * their suffix.
 */
export function applyDevManifestUrls<T extends ManifestModuleEntry>(
  manifest: ModuleManifestShape<T>,
  configured: ManifestUrls,
  overrides: ManifestUrls,
): ModuleManifestShape<T> {
  const rewrite = buildOriginRewriter(configured, overrides);
  if (!rewrite) return manifest;
  return {
    ...manifest,
    modules: manifest.modules.map((module) =>
      rewriteModuleOptions(module, rewrite),
    ),
  };
}

/**
 * Fields a manifest module carries that no anonymous caller may see.
 */
export interface ManifestFieldPolicy {
  privateOptions: boolean;
  path: boolean;
  /** Also governs `publicEndpoints` and `backendProxies`, the other routing declarations. */
  authEstablishEndpoints: boolean;
}

function applyFieldPolicy<T extends ManifestModuleEntry>(
  module: T,
  keep: ManifestFieldPolicy,
): T {
  const shaped = { ...module };
  if (!keep.privateOptions) delete shaped.privateOptions;
  if (!keep.path) delete shaped.path;

  if (!keep.authEstablishEndpoints) {
    delete shaped.authEstablishEndpoints;
    delete shaped.publicEndpoints;
    delete shaped.backendProxies;
  }
  return shaped;
}

/**
 * Drop the manifest fields a caller is not entitled to.
 *
 * Copies every module rather than deleting in place: the registry behind the
 * manifest is long-lived shared state and hands out live references, so a
 * mutating strip would permanently withhold the fields from every subsequent
 * authenticated caller too.
 *
 * @param manifest Manifest built from the live module registry
 * @param keep Which sensitive fields this caller may receive
 * @returns A manifest carrying only the permitted fields
 */
export function stripPrivateManifestFields<T extends ManifestModuleEntry>(
  manifest: ModuleManifestShape<T>,
  keep: ManifestFieldPolicy,
): ModuleManifestShape<T> {
  if (keep.privateOptions && keep.path && keep.authEstablishEndpoints)
    return manifest;
  return {
    ...manifest,
    modules: manifest.modules.map((module) => applyFieldPolicy(module, keep)),
  };
}

interface NamedManifestModule extends ManifestModuleEntry {
  name: string;
}

function proxyPath(proxy: unknown): string | undefined {
  if (!proxy || typeof proxy !== "object") return undefined;
  const { path } = proxy as { path?: unknown };
  return typeof path === "string" ? path : undefined;
}

/**
 * The backend proxies a manifest shaped by `keep` withholds, each named
 * `<module> <path>`: none when the caller may receive them.
 *
 * @param modules The modules before the field policy applies
 * @param keep Which sensitive fields this caller may receive
 * @returns The withheld proxies, in the modules' order
 */
export function listDroppedBackendProxies(
  modules: NamedManifestModule[],
  keep: ManifestFieldPolicy,
): string[] {
  if (keep.authEstablishEndpoints) return [];
  return modules.flatMap((module) =>
    (module.backendProxies ?? []).map(
      (proxy) => `${module.name} ${proxyPath(proxy) ?? "(no path)"}`,
    ),
  );
}
