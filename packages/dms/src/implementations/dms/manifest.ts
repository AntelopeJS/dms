import type { IncomingMessage } from "node:http";

export interface ManifestModuleEntry {
  options?: Record<string, unknown>;
  privateOptions?: Record<string, unknown>;
  path?: string;
}

export interface ModuleManifestShape<
  T extends ManifestModuleEntry = ManifestModuleEntry,
> {
  pack: string;
  modules: T[];
}

export interface FrontendManifest<T extends ManifestModuleEntry> {
  version: number;
  archive: string;
  modules: T[];
}

export interface ManifestUrls {
  apiBaseUrl?: string;
  clientBaseUrl?: string;
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

// Origin boundary: the configured URL is only substituted when it ends the
// string or is followed by a path / query / fragment separator. This keeps
// `http://h:5010` from matching inside `http://h:50100` (port prefix).
const URL_BOUNDARY = "(?=[/?#]|$)";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildOriginRewriter(
  configured: ManifestUrls,
  overrides: ManifestUrls,
): OriginRewriter | undefined {
  const replacements = new Map<string, string>();
  if (configured.apiBaseUrl && overrides.apiBaseUrl) {
    replacements.set(configured.apiBaseUrl, overrides.apiBaseUrl);
  }
  if (configured.clientBaseUrl && overrides.clientBaseUrl) {
    replacements.set(configured.clientBaseUrl, overrides.clientBaseUrl);
  }
  if (replacements.size === 0) return undefined;

  // Longest-first so a URL that is a prefix of another wins the match.
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
}

function applyFieldPolicy<T extends ManifestModuleEntry>(
  module: T,
  keep: ManifestFieldPolicy,
): T {
  const shaped = { ...module };
  if (!keep.privateOptions) delete shaped.privateOptions;
  if (!keep.path) delete shaped.path;
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
  if (keep.privateOptions && keep.path) return manifest;
  return {
    ...manifest,
    modules: manifest.modules.map((module) => applyFieldPolicy(module, keep)),
  };
}
