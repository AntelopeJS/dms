const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;
const LOOPBACK_IPV4_MAPPED = /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/;
const LOOPBACK_IPV6 = "::1";
const LOOPBACK_NAME = "localhost";
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

/** What a developer sets in the dms config to point the bridge at the backend on this machine. */
export const BACKEND_URL_HINT =
  'Set mcp.backendUrl to "${@api.API_LOCAL_BASE_URL}" in the dms config, then restart the project.';

/** Whether `url` is an http(s) URL whose host is this machine's loopback, the only host the bridge may send its credential to. */
export function isLoopbackUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!WEB_PROTOCOLS.has(parsed.protocol)) return false;
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  return (
    host === LOOPBACK_NAME ||
    host === LOOPBACK_IPV6 ||
    LOOPBACK_IPV4.test(host) ||
    LOOPBACK_IPV4_MAPPED.test(host)
  );
}

/** Where the bridge sends its requests, or why no credential may be written. */
export type BridgeOrigin = { origin: string } | { refusal: string };

/**
 * The origin the bridge targets: `backendUrl` when set, else `apiBaseUrl`,
 * which is the public backend URL and so counts only when its host is loopback.
 */
export function resolveBridgeOrigin(
  backendUrl: string | undefined,
  apiBaseUrl: string,
): BridgeOrigin {
  const source =
    backendUrl === undefined
      ? `apiBaseUrl (${apiBaseUrl})`
      : `mcp.backendUrl (${backendUrl})`;
  const origin = (backendUrl ?? apiBaseUrl).replace(/\/+$/, "");
  if (isLoopbackUrl(origin)) return { origin };
  return {
    refusal: `[DMS] The MCP bridge was not written: ${source} is not on this machine, and the bridge sends its credential only to a backend that is. ${BACKEND_URL_HINT}`,
  };
}
