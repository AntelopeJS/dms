import type { Db } from "mongodb";
import { z } from "zod";
import {
  mongoAccess,
  type MongoPrivilege,
  type MongoRelation,
} from "./access-mongodb";
import {
  failureMessage,
  hasControlCharacter,
  missingClient,
  noAnswerReason,
  type Probe,
  refusedBy,
  serverRefusal,
  signedIn,
  unanswered,
} from "./database-access";
import { loadClient } from "./probe-client";
import { MAX_SCRAM_ITERATIONS, withBoundedScram } from "./scram-bound";

const WRONG_ACCOUNT = "The database refused this user name or password.";
const NEEDS_SIGN_IN = "This server asks for a user name and a password.";
const CANNOT_LIST =
  "This account cannot list the collections of this database.";
const NOT_UNDERSTOOD =
  "The server answered in a way this check does not understand.";
const AUTHENTICATION_FAILED = 18;
const UNAUTHORIZED = 13;
const OTHER_MECHANISM =
  "This check signs in with the user name and password of the URL only: remove authMechanism, or set it to SCRAM-SHA-256, SCRAM-SHA-1 or PLAIN.";
const LOCAL_FILES =
  "This check reads no certificate or key file of this computer: remove tlsCAFile, tlsCRLFile and tlsCertificateKeyFile from the URL.";
const UNREADABLE_URL = "This URL could not be read.";

/** The mechanisms that sign in with the URL's user name and password, and nothing of this computer. */
const URL_MECHANISMS = new Set([
  "DEFAULT",
  "SCRAM-SHA-1",
  "SCRAM-SHA-256",
  "PLAIN",
]);

/**
 * The options, lowercased, for which `mongodb` reads a file of this computer: those of 6 and 7, and
 * those 4 and 5 read with `readFileSync` while they parse the URL, since a project may resolve one.
 */
const LOCAL_FILE_OPTIONS = new Set([
  "tlscafile",
  "tlscrlfile",
  "tlscertificatekeyfile",
  "tlscertificatekeyfilepassword",
  "tlscertificatefile",
  "sslca",
  "sslcrl",
  "sslcert",
  "sslkey",
  "sslpass",
]);

/** The options of a URL, as the parser `mongodb` reads it with gives them. */
type UrlOptions = Iterable<[string, string]>;

/**
 * Why the check refuses `url` before `mongodb` reads it: a mechanism that signs in with an identity
 * of this computer (its AWS keys, a Kerberos ticket, an OIDC token file or metadata service, a
 * certificate), or an option that reads a file of it. `mongodb` matches `authMechanism` as a regular
 * expression while it builds the client, so a value outside the four names is refused here, before
 * it can hold the process. The URL is read by `parse`, the parser `mongodb` reads it with, and a
 * URL that parser would rewrite is refused, so the check sees the very keys and values the client
 * sees. `undefined` when it signs in with what the URL carries only.
 */
function localRefusal(
  url: string,
  parse: (url: string) => UrlOptions,
): string | undefined {
  if (hasControlCharacter(url)) {
    return UNREADABLE_URL;
  }
  let options: UrlOptions;
  try {
    options = parse(url);
  } catch {
    return UNREADABLE_URL;
  }
  for (const [name, value] of options) {
    const key = name.toLowerCase();
    if (key === "authmechanism" && !URL_MECHANISMS.has(value.toUpperCase())) {
      return OTHER_MECHANISM;
    }
    if (LOCAL_FILE_OPTIONS.has(key)) {
      return LOCAL_FILES;
    }
  }
  return undefined;
}

const Privilege = z.object({
  resource: z.object({
    db: z.string().optional(),
    collection: z.string().optional(),
    anyResource: z.boolean().optional(),
  }),
  actions: z.array(z.string()),
});

/**
 * The answer of `connectionStatus` with `showPrivileges`, as the catalog of `@antelopejs/mongodb`
 * 1.7.0 reads it (`Privileges` and `AuthenticatedRole` in `dist/implementations/catalog/discovery.js`).
 */
const ConnectionStatus = z.object({
  authInfo: z.object({
    authenticatedUsers: z.array(z.object({ user: z.string() })),
    authenticatedUserPrivileges: z.array(z.unknown()),
  }),
});

function privilegesOf(entries: readonly unknown[]): MongoPrivilege[] {
  return entries.flatMap((entry) => {
    const privilege = Privilege.safeParse(entry);
    return privilege.success ? [privilege.data] : [];
  });
}

/** The collections of the database, or `undefined` when the account may not list them. */
async function listRelations(db: Db): Promise<MongoRelation[] | undefined> {
  try {
    return await db.listCollections({}, { nameOnly: false }).toArray();
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === UNAUTHORIZED
    ) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Checks a MongoDB connection with `mongodb`, on the database the URL's path names: it signs in,
 * reads the account and its privileges with `connectionStatus`, and lists the collections as the
 * catalog of `@antelopejs/mongodb` does, and leaves the client for the check to close. It runs no
 * command that writes.
 */
export const probeMongodb: Probe = async (url, timeoutMs, connections) => {
  const mongodb = loadClient("mongodb");
  if (!mongodb) {
    return missingClient("mongodb", "MongoDB");
  }
  const urls = loadClient("mongodb-connection-string-url");
  const refused = urls
    ? localRefusal(
        url,
        (written) => new urls.ConnectionString(written).searchParams,
      )
    : UNREADABLE_URL;
  if (refused !== undefined) {
    return unanswered(refused);
  }
  const { answer, refused: iterations } = await withBoundedScram(async () => {
    try {
      const client = new mongodb.MongoClient(url, {
        serverSelectionTimeoutMS: timeoutMs,
        connectTimeoutMS: timeoutMs,
        socketTimeoutMS: timeoutMs,
      });
      connections.add(() => client.close());
      await client.connect();
      const db = client.db();
      const started = performance.now();
      const status = ConnectionStatus.safeParse(
        await db.command({ connectionStatus: 1, showPrivileges: true }),
      );
      const latencyMs = Math.ceil(performance.now() - started);
      if (!status.success) {
        return refusedBy(NOT_UNDERSTOOD);
      }
      const { authenticatedUsers, authenticatedUserPrivileges } =
        status.data.authInfo;
      const user = authenticatedUsers[0]?.user;
      const relations = await listRelations(db);
      if (!relations) {
        return user === undefined
          ? refusedBy(NEEDS_SIGN_IN)
          : signedIn(
              latencyMs,
              user,
              { canRead: false, canWrite: false },
              CANNOT_LIST,
            );
      }
      return signedIn(
        latencyMs,
        user,
        mongoAccess({
          database: db.databaseName,
          user,
          privileges: privilegesOf(authenticatedUserPrivileges),
          relations,
        }),
      );
    } catch (error) {
      if (error instanceof mongodb.MongoServerError) {
        return error.code === AUTHENTICATION_FAILED
          ? refusedBy(WRONG_ACCOUNT)
          : refusedBy(serverRefusal(error.message, url));
      }
      return unanswered(noAnswerReason(failureMessage(error), url));
    }
  });
  return iterations === undefined
    ? answer
    : refusedBy(
        `The server asks to derive the password with ${iterations} SCRAM iterations; the check derives at most ${MAX_SCRAM_ITERATIONS}.`,
      );
};
