import { z } from "zod";

/**
 * Bound on an invite's name parts. The invite form mirrors it as the field's
 * `maxLength` so the browser stops an over-long value first: a server-side
 * rejection surfaces as a raw validation dump in the submit toast.
 */
export const INVITE_NAME_MAX_LENGTH = 100;

/** Bound on the full name typed in the invite form's single name field. */
export const INVITE_FULL_NAME_MAX_LENGTH = INVITE_NAME_MAX_LENGTH * 2;

/**
 * Most addresses one invite request may carry: enough to paste a team, few
 * enough that the invitations, sent one after the other, answer in time.
 */
export const INVITE_EMAILS_MAX = 50;

const LEGACY_EMAIL_KEY = "email";
const EMAILS_KEY = "emails";
const NAME_SEPARATOR = /\s+/;

/**
 * Callers written before invitations took a list send a single `email`: it is
 * read as a one-address list so they keep working.
 */
function acceptLegacySingleEmail(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null) return payload;
  const record = payload as Record<string, unknown>;
  if (record[EMAILS_KEY] !== undefined) return payload;
  const email = record[LEGACY_EMAIL_KEY];
  if (typeof email !== "string") return payload;
  return { ...record, [EMAILS_KEY]: [email] };
}

// Trimmed and bounded: whitespace alone would pass for a name while
// `inviteeDisplayName` drops it, so the invitation would go out nameless; and
// the value is persisted, then carried in the signup link's `name` query
// parameter. An empty string means "not provided" (the client sends "" when
// the field is touched then cleared).
const inviteNamePart = z.string().trim().max(INVITE_NAME_MAX_LENGTH);

const memberInviteObjectSchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().email())
    .min(1, "$page.settings.members.invite.emails_required")
    .max(INVITE_EMAILS_MAX, "$page.settings.members.invite.emails_too_many"),
  name: z.string().trim().max(INVITE_FULL_NAME_MAX_LENGTH).optional(),
  firstname: inviteNamePart.optional(),
  lastname: inviteNamePart.optional(),
  roles: z.array(z.string()).optional(),
  language: z.string(),
  asTenantOwner: z.boolean(),
});

export const memberInviteSchema = z.preprocess(
  acceptLegacySingleEmail,
  memberInviteObjectSchema.refine(
    (data) => data.asTenantOwner || (data.roles && data.roles.length > 0),
    {
      message: "$page.settings.members.invite.roles_required",
      path: ["roles"],
    },
  ),
);

export type MemberInvitePayload = z.infer<typeof memberInviteSchema>;

/** The name parts an invitation stores. */
export interface InviteeNameParts {
  firstname?: string;
  lastname?: string;
}

/**
 * The first and last name an invitation stores, from what the inviter typed:
 * explicit parts win, otherwise the full name splits into its first word and
 * the rest.
 */
export function resolveInviteeNameParts(
  payload: Pick<MemberInvitePayload, "name" | "firstname" | "lastname">,
): InviteeNameParts {
  if (payload.firstname || payload.lastname || !payload.name) {
    return { firstname: payload.firstname, lastname: payload.lastname };
  }
  const [firstname, ...rest] = payload.name.split(NAME_SEPARATOR);
  return { firstname, lastname: rest.join(" ") || undefined };
}

/**
 * The addresses of an invite request once, in the order typed: pasting the
 * same list twice must not send two invitations to one person.
 */
export function uniqueInviteEmails(emails: readonly string[]): string[] {
  return [...new Set(emails)];
}
