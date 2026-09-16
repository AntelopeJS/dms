import { z } from "zod";

/**
 * Bound on an invite's name parts. The invite form mirrors it as the field's
 * `maxLength` so the browser stops an over-long value first: a server-side
 * rejection surfaces as a raw validation dump in the submit toast.
 */
export const INVITE_NAME_MAX_LENGTH = 100;

export const memberInviteSchema = z
  .object({
    email: z.string().email(),
    // Optional: an empty string means "not provided" (the client sends "" when
    // the field is touched then cleared). The superRefine below enforces a
    // non-empty value only when email validation is skipped.
    // Trimmed and bounded: whitespace alone satisfies the requiredness rule
    // below while `inviteeDisplayName` drops it, so the invitation would go out
    // nameless; and the value is persisted, then carried in the signup link's
    // `name` query parameter.
    firstname: z.string().trim().max(INVITE_NAME_MAX_LENGTH).optional(),
    lastname: z.string().trim().max(INVITE_NAME_MAX_LENGTH).optional(),
    roles: z.array(z.string()).optional(),
    language: z.string(),
    asTenantOwner: z.boolean(),
    skipEmailValidation: z.boolean().default(false),
  })
  .refine(
    (data) => data.asTenantOwner || (data.roles && data.roles.length > 0),
    {
      message: "$page.settings.members.invite.roles_required",
      path: ["roles"],
    },
  )
  .superRefine((data, ctx) => {
    if (!data.skipEmailValidation) return;
    if (!data.firstname) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "$page.settings.members.invite.firstname_required",
        path: ["firstname"],
      });
    }
    if (!data.lastname) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "$page.settings.members.invite.lastname_required",
        path: ["lastname"],
      });
    }
  });
