import type {
  DatabaseAccess,
  DatabaseEngine,
} from "@antelopejs/interface-dms-builder";
import { z } from "zod";

/**
 * The engines `CheckDatabaseConnection` takes, as the values of the interface's `DatabaseEngine`.
 */
export const DATABASE_ENGINES = [
  "postgres",
  "mysql",
  "mongodb",
  "rethinkdb",
] as const satisfies readonly DatabaseEngine[];

const NOT_CHECKED = "Could not check the database";
/** The sentence for a failure that carries no message, such as the empty `AggregateError` of a refused `localhost`, which tries each of its addresses. */
const NO_MESSAGE = "The database could not be reached at this host and port.";
const REDACTED = "[hidden]";
const USERINFO = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)@/i;
const CONNECTION_STRING = /(?<![a-z0-9+.-])[a-z0-9+.-]+:\/\/[^\s"']+/gi;

const NO_ANSWER_REASONS: readonly (readonly [RegExp, string])[] = [
  [/ECONNREFUSED/, "Nothing is listening at this host and port."],
  [/ENOTFOUND|EAI_AGAIN/, "This host name could not be found."],
  [
    /time(?:d)? ?out|in less than|did not answer/i,
    "The database did not answer in time.",
  ],
];

/** No server answered: the host, the port or the network is wrong. */
export function unanswered(reason: string): DatabaseAccess {
  return { reachable: false, canRead: false, canWrite: false, reason };
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
  .pipe(z.object({ message: z.string() }))
  .transform(({ message }) => message)
  .catch("The check ended with an error that carries no message.");

/** The message of a thrown `Error`; any other thrown value, or a message that is no string, says nothing a person could use. */
export function failureMessage(error: unknown): string {
  return ThrownMessage.parse(error);
}

/**
 * What a driver appends to its message to show the query it ran: the ReQL of RethinkDB after
 * `in:`, and the command document of MongoDB's authorization error.
 */
const QUERY_ECHOES: readonly RegExp[] = [
  /(?<!\s)\s+in:\s*\n[\s\S]*$/,
  /(?<=\bcommand) \{[\s\S]*$/,
];

/** The message without the query the driver echoes, which a reason never shows. */
function withoutQuery(message: string): string {
  return QUERY_ECHOES.reduce((text, echo) => text.replace(echo, ""), message);
}

/** The sentence for a failure no server answered: its own, or the driver's message with the query and the secrets removed. */
export function noAnswerReason(message: string, url: string): string {
  const text = withoutQuery(message).trim();
  if (text === "") {
    return NO_MESSAGE;
  }
  const known = NO_ANSWER_REASONS.find(([pattern]) => pattern.test(text));
  return known ? known[1] : `${NOT_CHECKED}: ${redact(text, url)}`;
}

/**
 * The sentence for a sign-in that did not happen and has no sentence of its own: the server
 * refused it, or the driver's probe refused the URL, such as a mechanism that would sign in with
 * the identity of this host. It names no culprit, since it cannot tell the two apart.
 */
export function signInRefusal(message: string, url: string): string {
  return `Could not sign in: ${redact(withoutQuery(message), url)}`;
}
