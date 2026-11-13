import type { Db } from "mongodb";
import { z } from "zod";
import {
  mongoAccess,
  type MongoPrivilege,
  type MongoRelation,
} from "./access-mongodb";
import {
  failureMessage,
  missingClient,
  noAnswerReason,
  type Probe,
  refusedBy,
  serverRefusal,
  signedIn,
  unanswered,
} from "./database-access";
import { loadClient } from "./probe-client";

const WRONG_ACCOUNT = "The database refused this user name or password.";
const NEEDS_SIGN_IN = "This server asks for a user name and a password.";
const CANNOT_LIST =
  "This account cannot list the collections of this database.";
const NOT_UNDERSTOOD =
  "The server answered in a way this check does not understand.";
const AUTHENTICATION_FAILED = 18;
const UNAUTHORIZED = 13;

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
};
