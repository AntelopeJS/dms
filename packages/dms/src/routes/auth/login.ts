import { assert } from "@antelopejs/interface-api-util";
import {
  type SessionModel,
  User,
  type UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { clearFailedPasswords, recordFailedPassword } from "../../hooks";
import type { ClientOrigin } from "../../utils";
import { authSchema } from "../../validation";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
} from "../../utils";
import { upgradePasswordHash } from "./password-hash-upgrade";
import { type LoginOutcome, resolveLoginOutcome } from "./session-response";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";

const HTTP_UNAUTHORIZED = 401;
const INVALID_CREDENTIALS_MESSAGE = "error.invalid_credentials";

export async function login(
  userModel: UserModel,
  sessionModel: SessionModel,
  body: ReturnType<typeof authSchema.login.parse>,
  userAgent: string,
  origin: ClientOrigin,
): Promise<LoginOutcome> {
  const { email, password } = body;
  const normalizedEmail = email.toLowerCase();
  assertLoginAllowed(normalizedEmail, origin.ip);
  const user = await userModel.getByEmail(normalizedEmail);
  const isPasswordValid = await (user ?? new User()).testHashAsync(
    "password",
    password,
  );
  if (isPasswordValid) assertLoginAllowed(normalizedEmail, origin.ip);
  else recordLoginFailure(normalizedEmail, origin.ip);

  assert(user, HTTP_UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
  fireAndForget(
    isPasswordValid
      ? clearFailedPasswords(user._id)
      : recordFailedPassword(user),
    "failed password bookkeeping",
  );
  assert(isPasswordValid, HTTP_UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
  clearLoginFailures(normalizedEmail);
  fireAndForget(
    upgradePasswordHash(userModel, user, password),
    "password hash upgrade",
  );

  return resolveLoginOutcome(sessionModel, user, userAgent, origin);
}
