import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type {
  SessionModel,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import {
  clearFailedPasswords,
  recordFailedPassword,
} from "../../utils/sign-in-monitor";
import type { ClientOrigin } from "../../utils/sign-in-country";
import { authSchema } from "../../validation/auth.schema";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "./login-throttle";
import { type LoginOutcome, resolveLoginOutcome } from "./session-response";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

const HTTP_UNAUTHORIZED = 401;
const INVALID_CREDENTIALS_MESSAGE = "error.invalid_credentials";

export async function login(
  userModel: UserModel,
  sessionModel: SessionModel,
  body: unknown,
  userAgent: string,
  origin: ClientOrigin,
): Promise<LoginOutcome> {
  const { email, password } = assertValidation(body, (v) =>
    authSchema.login.parse(v),
  );
  const normalizedEmail = email.toLowerCase();
  assertLoginAllowed(normalizedEmail, origin.ip);
  const user = await userModel.getByEmail(normalizedEmail);
  const isPasswordValid = !!user && user.testHash("password", password);
  if (!isPasswordValid) recordLoginFailure(normalizedEmail, origin.ip);

  assert(user, HTTP_UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
  fireAndForget(
    isPasswordValid
      ? clearFailedPasswords(user._id)
      : recordFailedPassword(user),
    "failed password bookkeeping",
  );
  assert(isPasswordValid, HTTP_UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
  clearLoginFailures(normalizedEmail);

  return resolveLoginOutcome(sessionModel, user, userAgent, origin);
}
