import { assert, assertValidation } from "@antelopejs/interface-api-util";
import type {
  SessionModel,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { authSchema } from "../../validation/auth.schema";
import { type LoginOutcome, resolveLoginOutcome } from "./session-response";

const HTTP_UNAUTHORIZED = 401;
const INVALID_CREDENTIALS_MESSAGE = "error.invalid_credentials";

export async function login(
  userModel: UserModel,
  sessionModel: SessionModel,
  body: unknown,
  userAgent: string,
  ip: string,
): Promise<LoginOutcome> {
  const { email, password } = assertValidation(body, (v) =>
    authSchema.login.parse(v),
  );
  const user = await userModel.getByEmail(email.toLowerCase());

  assert(user, HTTP_UNAUTHORIZED, INVALID_CREDENTIALS_MESSAGE);
  assert(
    user.testHash("password", password),
    HTTP_UNAUTHORIZED,
    INVALID_CREDENTIALS_MESSAGE,
  );

  return resolveLoginOutcome(sessionModel, user, userAgent, ip);
}
