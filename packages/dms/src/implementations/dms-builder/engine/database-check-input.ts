import {
  type DatabaseAccess,
  type DatabaseEngine,
  DATABASE_ENGINE_SCHEMES,
  type OpResult,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { DATABASE_ENGINES } from "./database-access";
import { checkDatabase } from "./database-check";
import { invalidConfig, unsupported } from "./ops";

const SCHEME = /^([a-z][a-z0-9+.-]*:)\/\//i;

function isUrlOf(engine: DatabaseEngine, url: string): boolean {
  const scheme = SCHEME.exec(url)?.[1]?.toLowerCase();
  return (
    scheme !== undefined &&
    DATABASE_ENGINE_SCHEMES[engine].some((accepted) => accepted === scheme)
  );
}

/** The sentence dms-builder 0.11.0 refuses a host with when the driver cannot read it. */
const HOST_PROBLEM =
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
 * Whether the host of `url` is a host name or an IPv6 address, for an engine whose driver does not
 * read a socket host. Any host passes for the other engines. A URL the driver cannot parse at all
 * is left to the check, which answers its failure.
 */
function hasReadableHost(engine: DatabaseEngine, url: string): boolean {
  if (SOCKET_HOST[engine]) {
    return true;
  }
  let host: string;
  try {
    host = decodeURIComponent(new URL(url).hostname);
  } catch {
    return true;
  }
  return host === "" || BRACKETED_IPV6.test(host) || HOST_NAME.test(host);
}

const CheckInputSchema = z
  .object({ engine: z.enum(DATABASE_ENGINES), url: z.string() })
  .refine(({ engine, url }) => isUrlOf(engine, url), { path: ["url"] });

/** What `parseCheckInput` answers. */
export type ParsedCheckInput = ReturnType<typeof CheckInputSchema.safeParse>;

/** Reads `input` as an engine and a URL of that engine's scheme. */
export function parseCheckInput(input: unknown): ParsedCheckInput {
  return CheckInputSchema.safeParse(input);
}

/**
 * Checks the database `parsed` names, once it is an engine and a URL of that engine's scheme. The
 * builder may be mounted outside development through `builder.enabled`, and this opens a
 * connection to a host the caller names, so it refuses unless `dev`. It refuses a host the
 * engine's driver would not read as written, such as a socket path for MySQL. A refusal names the
 * fields of the input, never their values.
 */
export async function checkConnection(
  parsed: ParsedCheckInput,
  dev: boolean,
): Promise<OpResult<DatabaseAccess>> {
  if (!dev) {
    return unsupported<DatabaseAccess>(
      "Databases are checked in development only.",
    );
  }
  if (!parsed.success) {
    const fields = [
      ...new Set(
        parsed.error.issues.flatMap(({ path: [field] }) =>
          field === undefined ? ["engine", "url"] : [String(field)],
        ),
      ),
    ];
    return invalidConfig<DatabaseAccess>(
      `Expected an engine of ${DATABASE_ENGINES.join(", ")} and a URL of that engine; check ${fields.join(", ")}.`,
    );
  }
  if (!hasReadableHost(parsed.data.engine, parsed.data.url)) {
    return invalidConfig<DatabaseAccess>(HOST_PROBLEM);
  }
  return {
    ok: true,
    data: await checkDatabase(parsed.data.engine, parsed.data.url),
    changes: [],
  };
}
