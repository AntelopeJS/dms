import * as z from "zod";

import { passwordSchema } from "./password";

const MAX_OAUTH_EXCHANGE_VALUE_LENGTH = 2048;
const MAX_LANGUAGE_TAG_LENGTH = 35;
const MAX_INVITE_TOKEN_LENGTH = 256;
const INVALID_2FA_TOKEN = "error.invalid_2fa_token";

// The sign-in step answers with message keys (see firstIssueMessage): the
// two-factor page translates them, and shows a refused code under its cells.
const twoFactorToken = z
  .string({ message: INVALID_2FA_TOKEN })
  .min(1, INVALID_2FA_TOKEN);

export const authSchema = {
  signup: z.object({
    name: z.string(),
    email: z.string().email(),
    password: passwordSchema,
    lang: z.string().optional(),
    token: z.string(),
  }),
  login: z.object({
    email: z.string().email(),
    password: z.string(),
    keep_login: z.boolean().optional(),
  }),
  oauthCallback: z.object({
    code: z.string().min(1).max(MAX_OAUTH_EXCHANGE_VALUE_LENGTH),
    state: z.string().min(1).max(MAX_OAUTH_EXCHANGE_VALUE_LENGTH),
    state_cookie: z.string().min(1).max(MAX_OAUTH_EXCHANGE_VALUE_LENGTH),
    language: z.string().max(MAX_LANGUAGE_TAG_LENGTH).optional(),
    invite: z.string().max(MAX_INVITE_TOKEN_LENGTH).optional(),
  }),
  refresh: z.object({
    token: z.string(),
  }),
  sessionHandoff: z.object({
    token: z.string().min(1),
  }),
  logout: z.object({
    token: z.string(),
  }),
  verifyEmail: z.object({
    token: z.string(),
  }),
  forgot: z.object({
    email: z.string().email(),
  }),
  validateInviteToken: z.object({
    token: z.string().max(MAX_INVITE_TOKEN_LENGTH),
    email: z.string().email(),
  }),
  validateForgotPasswordToken: z.object({
    token: z.string(),
    email: z.string().email(),
  }),
  reset: z.object({
    token: z.string(),
    email: z.string().email(),
    password: passwordSchema,
  }),
  verify2FA: z.object(
    {
      token: twoFactorToken,
      code: z.string({ message: "error.invalid_2fa_code" }),
      method: z.enum(["totp", "email", "backup"], {
        message: "error.invalid_2fa_method",
      }),
    },
    { message: INVALID_2FA_TOKEN },
  ),
  request2FAEmail: z.object(
    { token: twoFactorToken },
    { message: INVALID_2FA_TOKEN },
  ),
  confirmTotp: z.object({
    code: z.string(),
  }),
  confirmEmailMethod: z.object({
    code: z.string(),
  }),
  disableTwoFactor: z.object({
    method: z.enum(["totp", "email"]),
    code: z.string(),
  }),
  regenerateBackup: z.object({
    code: z.string(),
  }),
};
