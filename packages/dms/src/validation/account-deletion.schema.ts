import * as z from "zod";

/** Longest current password accepted for verification; bounds hashing work. */
const MAX_CURRENT_PASSWORD_LENGTH = 1024;
/** Longest e-mail address (RFC 5321 path limit). */
const MAX_EMAIL_LENGTH = 320;

/**
 * Body of "Delete my account": the current password (absent only for an
 * account that signs in with a provider and never set one) and the account's
 * e-mail, typed again.
 */
export const accountDeletionSchema = z.object({
  password: z.string().min(1).max(MAX_CURRENT_PASSWORD_LENGTH).optional(),
  confirmation: z.string().min(1).max(MAX_EMAIL_LENGTH),
});

export type AccountDeletionInput = z.infer<typeof accountDeletionSchema>;
