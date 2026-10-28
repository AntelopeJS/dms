import type {
  AddFrontendModuleOptions,
  FrontendBackendProxy,
} from "@antelopejs/interface-dms/page";

type BackendProxyAuth = Required<FrontendBackendProxy>["auth"];

const SEGMENT = "(?:\\*|[A-Za-z0-9][A-Za-z0-9._~-]*)";
const PROXY_PATH = new RegExp(
  `^/[A-Za-z0-9][A-Za-z0-9._~-]*(?:/${SEGMENT})*(?:/\\*\\*)?$`,
);
/** The renderer's own paths, never a backend's. */
const RENDERER_PREFIXES = ["/api/_dms", "/@", "/assets", "/node_modules"];
const AUTH_MODES = new Set<BackendProxyAuth>(["session", "none"]);
const DEFAULT_AUTH: BackendProxyAuth = "session";

function isRendererPath(path: string): boolean {
  return RENDERER_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

function isValidBackendProxy(proxy: FrontendBackendProxy): boolean {
  return (
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Proxy declarations cross the JavaScript module registration boundary, so the existing object rejection remains necessary.
    typeof proxy === "object" &&
    proxy !== null &&
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The existing boundary rejects nonstring paths instead of coercing them during regex matching.
    typeof proxy.path === "string" &&
    PROXY_PATH.test(proxy.path) &&
    !isRendererPath(proxy.path) &&
    (proxy.auth === undefined || AUTH_MODES.has(proxy.auth))
  );
}

/**
 * The backend prefixes a module declares, checked and spelled out (`auth`
 * defaulted).
 *
 * A malformed declaration is a registration error, as for the public
 * endpoints: dropping it would let the module start with a prefix the
 * frontend server then never proxies.
 *
 * @param config Module registration as the module wrote it
 * @returns The declared prefixes, in declaration order
 */
export function resolveBackendProxies(
  config: AddFrontendModuleOptions,
): Required<FrontendBackendProxy>[] {
  const declared = config.backendProxies ?? [];
  const invalid = declared.filter((proxy) => !isValidBackendProxy(proxy));
  if (invalid.length > 0) {
    throw new Error(
      `Frontend module "${config.name}" declares invalid backendProxies: ` +
        `${invalid.map((proxy) => JSON.stringify(proxy)).join(", ")}. ` +
        'Each entry is { path: "/x", "/x/*" or "/x/**" (first segment ' +
        "literal, outside /api/_dms, /@, /assets and /node_modules), auth?: " +
        '"session" | "none" }.',
    );
  }
  return declared.map((proxy) => ({
    path: proxy.path,
    auth: proxy.auth ?? DEFAULT_AUTH,
  }));
}

/** A copy a caller cannot use to change the declaration. */
export function copyBackendProxies(
  proxies: Required<FrontendBackendProxy>[],
): Required<FrontendBackendProxy>[] {
  return proxies.map((proxy) => ({ path: proxy.path, auth: proxy.auth }));
}
