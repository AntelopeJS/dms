import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  TenantMemberModel,
  type UserInvite,
} from "@antelopejs/interface-dms/db";
import {
  announceRegistration,
  sendEmailValidationEmail,
} from "@antelopejs/interface-dms/auth";
import type {
  SessionModel,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import randomstring from "randomstring";
import { getAuthConfig } from "../../config";
import { generateAuthKey } from "../../utils/auth-key";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { authSchema } from "../../validation/auth.schema";
import { consumeInvite, resolveValidInvite } from "./invite";
import { issueAuthResponse } from "./session-response";
import type { AuthResponse } from "./types";

const VALIDATION_TOKEN_LENGTH = 6;

function buildValidationFields(invite: UserInvite) {
  const config = getAuthConfig();
  const shouldValidate =
    config.mustValidateEmail && !invite.skipEmailValidation;

  return {
    isValidated: invite.skipEmailValidation || false,
    validationToken: shouldValidate
      ? randomstring.generate({
          length: VALIDATION_TOKEN_LENGTH,
          capitalization: "uppercase",
        })
      : undefined,
    validationRequestedAt: shouldValidate ? new Date() : undefined,
  };
}

/** The account a signup creates or takes over. `name`, `email` and `password`
 * are three adjacent strings. */
interface SignupAccount {
  name: string;
  email: string;
  password: string;
  lang: string | undefined;
  invite: UserInvite;
}

async function createNewUser(
  userModel: UserModel,
  { name, email, password, lang, invite }: SignupAccount,
) {
  const validation = buildValidationFields(invite);
  const result = await userModel.insert({
    createdAt: new Date(),
    updatedAt: new Date(),
    name,
    email: email.toLowerCase(),
    password,
    authKey: generateAuthKey(),
    ...validation,
    owner: false,
    language: lang || "en",
  });
  return result?.[0];
}

async function overwriteUnvalidatedUser(
  userModel: UserModel,
  existingUser: NonNullable<Awaited<ReturnType<UserModel["get"]>>>,
  { name, email, password, lang, invite }: SignupAccount,
) {
  const validation = buildValidationFields(invite);
  existingUser.createdAt = new Date();
  existingUser.updatedAt = new Date();
  existingUser.name = name;
  existingUser.email = email.toLowerCase();
  existingUser.password = password;
  existingUser.authKey = generateAuthKey();
  existingUser.validationToken = validation.validationToken as string;
  existingUser.validationRequestedAt = validation.validationRequestedAt as Date;
  existingUser.isValidated = validation.isValidated;
  existingUser.language = lang || "en";

  await userModel.update(existingUser);
  return existingUser._id;
}

async function upsertSignupUser(
  userModel: UserModel,
  existingUser: Awaited<ReturnType<UserModel["getByEmail"]>>,
  account: SignupAccount,
): Promise<NonNullable<Awaited<ReturnType<UserModel["get"]>>>> {
  const userId = existingUser
    ? await overwriteUnvalidatedUser(userModel, existingUser, account)
    : await createNewUser(userModel, account);

  assert(userId, 500, `New user not created : \n`);

  const user = await userModel.get(userId);
  assert(user, 500, `New user not found : \nID:${userId}`);
  return user;
}

/**
 * Load the account already holding this e-mail, refusing the signup unless
 * that account is a draft the invitee may take over.
 *
 * Overwriting an existing row is meant for an abandoned signup draft: an
 * invitee who started once, never validated, and comes back through a fresh
 * invitation. An account that already belongs to a workspace — any workspace,
 * hence CROSS_INSTANCE — is not that: rewriting it would hand its name, its
 * password and a live session to whoever holds an invitation for that address,
 * and the rotated authKey would sign its holder out everywhere. `isValidated`
 * cannot separate the two on its own, because a module can provision a real
 * account without ever running e-mail validation.
 *
 * The address is lower-cased for the lookup, as `login` does: accounts are
 * stored that way and the `email` index matches exactly, so reading it as
 * typed would let a capitalised address walk past the guard entirely.
 *
 * @param userModel Users model
 * @param email E-mail the signup claims
 * @returns The draft to overwrite, or undefined when the e-mail is free
 */
async function resolveOverwritableAccount(
  userModel: UserModel,
  email: string,
): Promise<Awaited<ReturnType<UserModel["getByEmail"]>>> {
  const existingUser = await userModel.getByEmail(email.toLowerCase());
  const belongsToWorkspace =
    !!existingUser &&
    (await GetModel(TenantMemberModel, CROSS_INSTANCE).existsByUser(
      existingUser._id,
    ));
  assert(
    !existingUser || (!existingUser.isValidated && !belongsToWorkspace),
    400,
    "error.email_already_used",
  );
  return existingUser;
}

export async function signup(
  userModel: UserModel,
  sessionModel: SessionModel,
  body: unknown,
  userAgent: string,
  ip: string,
): Promise<AuthResponse> {
  const { name, email, password, token, lang } = assertValidation(body, (v) =>
    authSchema.signup.parse(v),
  );

  const config = getAuthConfig();

  // The invitation is settled first so that a caller holding no invitation
  // learns nothing: taking the account first answers an anonymous prober,
  // whose bogus token then draws one refusal for a known address and another
  // for an unknown one.
  const resolvedInvite = await resolveValidInvite(token, email);
  const { invite: existingInvite, tenantId } = resolvedInvite;

  const existingUser = await resolveOverwritableAccount(userModel, email);

  const user = await upsertSignupUser(userModel, existingUser, {
    name,
    email,
    password,
    lang,
    invite: existingInvite,
  });

  await consumeInvite(userModel, user._id, resolvedInvite);

  const refreshedUser = await userModel.get(user._id);
  assert(refreshedUser, 500, `New user not found : \nID:${user._id}`);

  const shouldSendValidation =
    config.mustValidateEmail && !existingInvite.skipEmailValidation;
  if (shouldSendValidation) {
    fireAndForget(
      sendEmailValidationEmail(refreshedUser),
      `validation email to "${refreshedUser.email}"`,
    );
  }

  await announceRegistration(userModel, refreshedUser, tenantId);

  return issueAuthResponse(
    sessionModel,
    tenantId,
    refreshedUser,
    userAgent,
    ip,
  );
}
