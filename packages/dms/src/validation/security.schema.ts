import * as z from "zod";

import { passwordSchema } from "./password";

/** Longest current password accepted for verification; bounds hashing work. */
const MAX_CURRENT_PASSWORD_LENGTH = 1024;

const currentPasswordSchema = z
  .string()
  .min(1)
  .max(MAX_CURRENT_PASSWORD_LENGTH);

/**
 * Bodies of the account security routes. Changing a credential always asks
 * for the current password, so a borrowed session cannot take over the
 * account by rewriting its sign-in email or password.
 */
export const securitySchema = {
  changePassword: z.object({
    // Optional only for an account that has no password yet (single sign-on).
    currentPassword: currentPasswordSchema.optional(),
    password: passwordSchema,
    signOutOtherSessions: z.boolean().optional(),
  }),
  changeEmail: z.object({
    email: z.string().email(),
    currentPassword: currentPasswordSchema,
  }),
};
