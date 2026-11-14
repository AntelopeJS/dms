import {
  type DatabaseEngine,
  DATABASE_ENGINE_SCHEMES,
} from "@antelopejs/interface-dms-builder";
import { DATABASE_ENGINES } from "./database-access";

/** The sentence dms-builder 0.11.0 refuses a host with when the driver cannot read it. */
export const HOST_PROBLEM =
  "the host is a name or an address only: no spaces, port or path";

/**
 * Whether the engine's driver reads a host that starts with `/` as a socket path, as dms-builder
 * 0.11.0 lists it. `mysql2` looks such a host up as a host name, and reads a socket only from its
 * `socketPath` parameter.
 */
const SOCKET_HOST: Readonly<Record<DatabaseEngine, boolean>> = {
  postgres: true,
  mysql: false,
  mongodb: true,
  rethinkdb: true,
};

const BRACKETED_IPV6 = /^\[[0-9a-f:.]+\]$/i;
const HOST_NAME = /^[A-Za-z0-9._~-]+$/;

/**
 * Whether the host of `url` is a host name or an IPv6 address, when the engine of its scheme has a
 * driver that does not read a socket host, a host that does not decode included. Any host passes
 * for the other engines. A URL that does not parse is left to its caller, which answers its
 * failure.
 */
export function hasReadableHost(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  const engine = DATABASE_ENGINES.find((candidate) =>
    DATABASE_ENGINE_SCHEMES[candidate].some(
      (scheme) => scheme === parsed.protocol,
    ),
  );
  if (engine === undefined || SOCKET_HOST[engine]) {
    return true;
  }
  let host: string;
  try {
    host = decodeURIComponent(parsed.hostname);
  } catch {
    return false;
  }
  return host === "" || BRACKETED_IPV6.test(host) || HOST_NAME.test(host);
}
