import * as z from "zod";

import { passwordSchema } from "./password";

const MAX_OAUTH_EXCHANGE_VALUE_LENGTH = 2048;
const MAX_LANGUAGE_TAG_LENGTH = 35;
const MAX_INVITE_TOKEN_LENGTH = 256;

export const authSchema = {
  signup: z.object({
    name: z.string(),
    email: z.string().email(),
    password: passwordSchema,
    lang: z.string(),
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
  logout: z.object({
    token: z.string(),
  }),
  verifyEmail: z.object({
    token: z.string(),
  }),
  forgot: z.object({
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
  verify2FA: z.object({
    token: z.string(),
    code: z.string(),
    method: z.enum(["totp", "email", "backup"]),
  }),
  request2FAEmail: z.object({
    token: z.string(),
  }),
  confirmTotp: z.object({
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
