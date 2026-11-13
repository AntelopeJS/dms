import { z } from "zod";
import type { ProbeConnections } from "./probe-connections";

/**
 * The engines of the *Connect a database* form, by the name the form sends.
 * Mirrored in `frontend-vue/builder/app/runtime/database-connect.ts`.
 */
export const DATABASE_ENGINES = ["postgres", "mongodb", "rethinkdb"] as const;

export type DatabaseEngine = (typeof DATABASE_ENGINES)[number];

/** What a live check of a database connection found: the answer of `POST /database/connections/check`. */
export interface DatabaseAccess {
  /** Whether a server answered, even to refuse the sign-in. */
  reachable: boolean;
  /** The round trip of the first query the signed-in account made. */
  latencyMs?: number;
  /** The account the server reports. */
  user?: string;
  canRead: boolean;
  canWrite: boolean;
  /** A short sentence for the person who connects, whenever the database cannot be read. Never holds the URL, the password or a query. */
  reason?: string;
}

export interface Privileges {
  canRead: boolean;
  canWrite: boolean;
}

/** What an account may do to one relation it can see: a table, a view, a collection. */
export interface RelationAccess {
  readable: boolean;
  writable: boolean;
}

/**
 * Checks one connection, with `timeoutMs` to connect, and never rejects with the URL in it. Each
 * client it opens is registered with `connections` at once: the check closes them, not the probe.
 */
export type Probe = (
  url: string,
  timeoutMs: number,
  connections: ProbeConnections,
) => Promise<DatabaseAccess>;

const NO_READ = "This account cannot read this database.";
const NOT_CHECKED = "Could not check the database";
const REDACTED = "[hidden]";
const USERINFO = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)@/i;
const CONNECTION_STRING = /[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi;

const NO_ANSWER_REASONS: readonly (readonly [RegExp, string])[] = [
  [/ECONNREFUSED/, "Nothing is listening at this host and port."],
  [/ENOTFOUND|EAI_AGAIN/, "This host name could not be found."],
  [/time(?:d)? ?out|in less than/i, "The database did not answer in time."],
];

/**
 * Whether the account may read the database and write to it, from what it may do to each relation
 * it can see. It writes when it can write to any relation, and it reads when it can read any
 * relation or when it sees none, as the catalogs of the database drivers decide.
 */
export function summarizeRelations(
  relations: readonly RelationAccess[],
): Privileges {
  return {
    canRead:
      relations.length === 0 || relations.some(({ readable }) => readable),
    canWrite: relations.some(({ writable }) => writable),
  };
}

/** No server answered: the host, the port or the network is wrong. */
export function unanswered(reason: string): DatabaseAccess {
  return { reachable: false, canRead: false, canWrite: false, reason };
}

/** A server answered and turned the sign-in, or the database, down. */
export function refusedBy(reason: string): DatabaseAccess {
  return { reachable: true, canRead: false, canWrite: false, reason };
}

/**
 * The account signed in, or the server asked for no sign-in and `user` is `undefined`. A reason
 * comes with it when it cannot read.
 */
export function signedIn(
  latencyMs: number,
  user: string | undefined,
  privileges: Privileges,
  unreadable: string = NO_READ,
): DatabaseAccess {
  const access: DatabaseAccess = { reachable: true, latencyMs, ...privileges };
  if (user !== undefined) {
    access.user = user;
  }
  if (!privileges.canRead) {
    access.reason = unreadable;
  }
  return access;
}

/** The client package of the engine is installed neither with this module nor in the project. */
export function missingClient(
  packageName: string,
  engineLabel: string,
): DatabaseAccess {
  return unanswered(
    `Install ${packageName} to connect a ${engineLabel} database.`,
  );
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function secretsOf(url: string): string[] {
  const userinfo = USERINFO.exec(url)?.[1] ?? "";
  const colon = userinfo.indexOf(":");
  const password = colon < 0 ? "" : userinfo.slice(colon + 1);
  const plain = decoded(password);
  return [...new Set([url, password, plain, encodeURIComponent(plain)])].filter(
    (secret) => secret !== "",
  );
}

/** The message without the connection string or the password, wherever a driver echoes them. */
export function redact(message: string, url: string): string {
  return secretsOf(url)
    .toSorted((left, right) => right.length - left.length)
    .reduce((text, secret) => text.replaceAll(secret, REDACTED), message)
    .replace(CONNECTION_STRING, REDACTED);
}

const ThrownMessage = z
  .instanceof(Error)
  .transform(({ message }) => message)
  .catch("The check ended with an error that carries no message.");

/** The message of a thrown `Error`; any other thrown value says nothing a person could use. */
export function failureMessage(error: unknown): string {
  return ThrownMessage.parse(error);
}

/**
 * What a driver appends to its message to show the query it ran: the ReQL of RethinkDB after
 * `in:`, and the command document of MongoDB's authorization error.
 */
const QUERY_ECHOES: readonly RegExp[] = [
  /\s+in:\s*\n[\s\S]*$/,
  /(?<=\bcommand) \{[\s\S]*$/,
];

/** The message without the query the driver echoes, which a reason never shows. */
function withoutQuery(message: string): string {
  return QUERY_ECHOES.reduce((text, echo) => text.replace(echo, ""), message);
}

/** The sentence for a failure no server answered: its own, or the driver's message with the query and the secrets removed. */
export function noAnswerReason(message: string, url: string): string {
  const text = withoutQuery(message);
  const known = NO_ANSWER_REASONS.find(([pattern]) => pattern.test(text));
  return known ? known[1] : `${NOT_CHECKED}: ${redact(text, url)}`;
}

/** The sentence for a failure a server answered with, when the engine has none of its own. */
export function serverRefusal(message: string, url: string): string {
  return `The server refused the request: ${redact(withoutQuery(message), url)}`;
}
