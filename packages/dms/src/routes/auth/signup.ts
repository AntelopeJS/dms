import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  TenantMemberModel,
  type UserInvite,
} from "@antelopejs/interface-dms/db";
import { announceRegistration } from "@antelopejs/interface-dms/auth";
import type {
  SessionModel,
  User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { generateAuthKey } from "../../utils/auth-key";
import type { ClientOrigin } from "../../utils/sign-in-country";
import { rememberSignInDevice } from "../../utils/sign-in-monitor";
import { authSchema } from "../../validation/auth.schema";
import { consumeInvite, resolveValidInvite } from "./invite";
import { issueAuthResponse } from "./session-response";
import type { AuthResponse } from "./types";

const DEFAULT_LANGUAGE = "en";

type ValidationFields = Pick<
  User,
  "isValidated" | "validationToken" | "validationRequestedAt"
>;

/**
 * An invitation signup is the address's validation, whatever
 * `auth.mustValidateEmail` says: the link reached the invitee through that
 * very mailbox, and an admin who copied it by hand vouches for the address. A
 * second round would only mail the invitee what the invitation already
 * proved. A draft taken over drops the token of the round it had started.
 */
const INVITE_SIGNUP_VALIDATION: ValidationFields = {
  isValidated: true,
  validationToken: null,
  validationRequestedAt: null,
};

/**
 * The language a signup account starts in: the one the invitee chose on the
 * signup page, else the one the invitation was written in.
 */
export function signupLanguage(
  lang: string | undefined,
  invite: UserInvite,
): string {
  return lang || invite.language || DEFAULT_LANGUAGE;
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
  const result = await userModel.insert({
    createdAt: new Date(),
    updatedAt: new Date(),
    name,
    email: email.toLowerCase(),
    password,
    authKey: generateAuthKey(),
    ...INVITE_SIGNUP_VALIDATION,
    owner: false,
    language: signupLanguage(lang, invite),
  });
  return result?.[0];
}

async function overwriteUnvalidatedUser(
  userModel: UserModel,
  existingUser: NonNullable<Awaited<ReturnType<UserModel["get"]>>>,
  { name, email, password, lang, invite }: SignupAccount,
) {
  existingUser.createdAt = new Date();
  existingUser.updatedAt = new Date();
  existingUser.name = name;
  existingUser.email = email.toLowerCase();
  existingUser.password = password;
  existingUser.authKey = generateAuthKey();
  existingUser.isValidated = INVITE_SIGNUP_VALIDATION.isValidated;
  existingUser.validationToken = INVITE_SIGNUP_VALIDATION.validationToken;
  existingUser.validationRequestedAt =
    INVITE_SIGNUP_VALIDATION.validationRequestedAt;
  existingUser.language = signupLanguage(lang, invite);

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
  origin: ClientOrigin,
): Promise<AuthResponse> {
  const { name, email, password, token, lang } = assertValidation(body, (v) =>
    authSchema.signup.parse(v),
  );

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

  await announceRegistration(userModel, refreshedUser, tenantId);
  await rememberSignInDevice(refreshedUser._id, userAgent, origin);

  return issueAuthResponse(
    sessionModel,
    tenantId,
    refreshedUser,
    userAgent,
    origin,
  );
}
