import type {
  ProbeAnswer,
  ProbeRefusal,
  ProbeUnreadable,
} from "@antelopejs/interface-database-catalog";
import type { DatabaseAccess } from "@antelopejs/interface-dms-builder";
import { z } from "zod";
import { noAnswerReason, signInRefusal, unanswered } from "./database-access";

const NO_READ = "This account cannot read this database.";
const NO_DATABASE = "The server has no database with this name.";
const NOT_UNDERSTOOD =
  "The database driver answered in a way this check does not understand.";

const Refusal = z.enum([
  "credentials",
  "host",
  "database",
  "database-denied",
  "sign-in-required",
  "other",
]) satisfies z.ZodType<ProbeRefusal>;

const Unreadable = z.enum([
  "no-database-named",
  "no-database",
  "cannot-list",
]) satisfies z.ZodType<ProbeUnreadable>;

/** The sentence for each refusal a person can act on; `other` says the server's own message. */
const REFUSALS: Record<Exclude<ProbeRefusal, "other">, string> = {
  credentials: "The database refused this user name or password.",
  host: "The database does not let this account connect from here.",
  database: NO_DATABASE,
  "database-denied": "This account may not use this database.",
  "sign-in-required": "This server asks for a user name and a password.",
};

/** The sentence for each reason an account that signed in cannot read, beyond its privileges. */
const UNREADABLE: Record<ProbeUnreadable, string> = {
  "no-database-named":
    "The URL names no database: add its name after the host and port.",
  "no-database": NO_DATABASE,
  "cannot-list":
    "This account cannot list the tables or collections of this database.",
};

/** What a driver's `probe` answers, read at the boundary since the driver is loaded at runtime. */
const ProbeAnswerSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("unreachable"), message: z.string() }),
  z.object({
    outcome: z.literal("refused"),
    refusal: Refusal,
    message: z.string(),
  }),
  z.object({
    outcome: z.literal("signed-in"),
    latencyMs: z.number().nonnegative().finite(),
    user: z.string().optional(),
    canRead: z.boolean(),
    canWrite: z.boolean(),
    unreadable: Unreadable.optional(),
  }),
]) satisfies z.ZodType<ProbeAnswer>;

const ReadProbeAnswer = ProbeAnswerSchema.optional().catch(undefined);

type SignedIn = Extract<ProbeAnswer, { outcome: "signed-in" }>;

function signedIn({
  latencyMs,
  user,
  canRead,
  canWrite,
  unreadable,
}: SignedIn): DatabaseAccess {
  const access: DatabaseAccess = {
    reachable: true,
    latencyMs: Math.ceil(latencyMs),
    canRead,
    canWrite,
  };
  if (user !== undefined) {
    access.user = user;
  }
  if (!canRead) {
    access.reason = unreadable === undefined ? NO_READ : UNREADABLE[unreadable];
  }
  return access;
}

/** What a driver's `probe` answered, or `undefined` when it answered in another shape. */
export function readProbeAnswer(answer: unknown): ProbeAnswer | undefined {
  return ReadProbeAnswer.parse(answer);
}

/**
 * What the connect flow answers for a driver's `probe` answer: the driver decides who signed in
 * and what the account may read and write, and this words it for the person who connects, without
 * the URL, the password or a query a driver echoes.
 */
export function accessOf(
  probed: ProbeAnswer | undefined,
  url: string,
): DatabaseAccess {
  if (probed === undefined) {
    return unanswered(NOT_UNDERSTOOD);
  }
  switch (probed.outcome) {
    case "unreachable":
      return unanswered(noAnswerReason(probed.message, url));
    case "refused":
      return {
        reachable: true,
        canRead: false,
        canWrite: false,
        reason:
          probed.refusal === "other"
            ? signInRefusal(probed.message, url)
            : REFUSALS[probed.refusal],
      };
    case "signed-in":
      return signedIn(probed);
  }
}
