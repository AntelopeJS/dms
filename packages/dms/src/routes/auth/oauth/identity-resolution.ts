import { assert } from "@antelopejs/interface-api-util";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  type User,
  UserExternalIdentityModel,
  type UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { generateAuthKey } from "../../../utils/auth-key";
import type { OAuthPolicy } from "./config";
import { decideOAuthResolution, type OAuthResolution } from "./linking-policy";
import type { ProviderIdentity } from "./providers";

const HTTP_INTERNAL_ERROR = 500;
const USER_NOT_CREATED_MESSAGE = "error.oauth.user_not_created";
const RESOLUTION_MISMATCH_MESSAGE = "error.oauth.resolution_mismatch";

const DEFAULT_LANGUAGE = "en";

export interface ResolvedOAuthUser {
  user: User;
  /**
   * Whether the account starts its life with this login — created outright, or
   * reclaimed from an unvalidated row. Drives the registration lifecycle.
   */
  isRegistration: boolean;
}

export interface OAuthResolutionRequest {
  provider: string;
  identity: ProviderIdentity;
  policy: OAuthPolicy;
  /**
   * Whether an invitation was validated against the provider e-mail before the
   * account was touched.
   */
  hasValidInvitation: boolean;
  /**
   * Locale to stamp on a freshly created account.
   */
  language?: string;
}

async function findUserByIdentity(
  userModel: UserModel,
  provider: string,
  providerAccountId: string,
): Promise<User | undefined> {
  const identity = await GetModel(
    UserExternalIdentityModel,
  ).getByProviderAccount(provider, providerAccountId);

  if (!identity) {
    return undefined;
  }

  return userModel.get(identity.userId);
}

/**
 * Take over an unvalidated account an invitation was addressed to.
 *
 * Whoever created that row never proved they own the address, so every
 * credential it carries is wiped rather than inherited: a leftover password,
 * an outstanding recovery token, a live session, a second factor or a
 * previously bound provider account must not survive into the invitee's
 * account — a retained second factor would lock the invitee out, and a
 * retained provider binding would let the previous holder keep signing in.
 * This mirrors what a password signup does when it overwrites an unvalidated
 * account.
 *
 * The write order is deliberate with no transaction available: bindings go
 * first, so no failure window ever leaves the account validated while the
 * previous holder is still linked. A failure in between leaves either the
 * untouched unvalidated account (minus its bindings) or a validated,
 * credential-less account the invitee re-enters through the same flow or
 * password recovery — the previous holder gains nothing in any window.
 */
export async function claimUnvalidatedAccount(
  userModel: UserModel,
  user: User,
  identity: ProviderIdentity,
  language: string,
): Promise<User> {
  await GetModel(UserExternalIdentityModel).deleteByUserId(user._id);

  user.name = identity.name;
  user.language = language;
  user.password = null;
  user.authKey = generateAuthKey();
  user.isValidated = true;
  user.validationToken = null;
  user.validationRequestedAt = null;
  user.forgotPasswordToken = null;
  user.forgotPasswordRequestedAt = null;
  user.twoFactorMethods = [];
  user.twoFactorSecret = null;
  user.twoFactorPendingSecret = null;
  user.twoFactorBackupCodes = [];
  user.twoFactorEmailCode = null;
  user.twoFactorEmailCodeRequestedAt = null;
  user.updatedAt = new Date();

  await userModel.update(user);
  return user;
}

async function createOAuthUser(
  userModel: UserModel,
  email: string,
  identity: ProviderIdentity,
  language: string,
): Promise<User> {
  const now = new Date();
  const ids = await userModel.insert({
    createdAt: now,
    updatedAt: now,
    name: identity.name,
    email,
    password: null,
    authKey: generateAuthKey(),
    isValidated: true,
    owner: false,
    language,
  });

  const user = ids[0] ? await userModel.get(ids[0]) : undefined;
  assert(user, HTTP_INTERNAL_ERROR, USER_NOT_CREATED_MESSAGE);
  return user;
}

interface OAuthResolutionContext {
  userModel: UserModel;
  identity: ProviderIdentity;
  email: string;
  language: string;
  linkedUser?: User;
  sameEmailUser?: User;
}

type OAuthResolutionHandler = (
  context: OAuthResolutionContext,
) => ResolvedOAuthUser | Promise<ResolvedOAuthUser>;

/**
 * The account a decision names must exist — a mismatch would mean the policy
 * and the lookups disagree, and silently falling through to account creation
 * would duplicate a user.
 */
function requireResolvedUser(user: User | undefined): User {
  assert(user, HTTP_INTERNAL_ERROR, RESOLUTION_MISMATCH_MESSAGE);
  return user;
}

const RESOLUTION_HANDLERS: Record<OAuthResolution, OAuthResolutionHandler> = {
  "use-linked": (context) => ({
    user: requireResolvedUser(context.linkedUser),
    isRegistration: false,
  }),
  "link-existing": (context) => ({
    user: requireResolvedUser(context.sameEmailUser),
    isRegistration: false,
  }),
  "claim-unvalidated": async (context) => ({
    user: await claimUnvalidatedAccount(
      context.userModel,
      requireResolvedUser(context.sameEmailUser),
      context.identity,
      context.language,
    ),
    isRegistration: true,
  }),
  create: async (context) => ({
    user: await createOAuthUser(
      context.userModel,
      context.email,
      context.identity,
      context.language,
    ),
    isRegistration: true,
  }),
};

/**
 * Map a provider identity onto a DMS account, applying the instance linking
 * policy (see `decideOAuthResolution` for the rules and their rationale).
 *
 * Two-factor authentication is untouched here: it gates the session issued
 * afterwards, exactly like a password login.
 *
 * @param userModel Users model
 * @param request Provider identity and the policy inputs applying to it
 * @returns The resolved account and whether this login registers it
 */
export async function resolveOAuthUser(
  userModel: UserModel,
  request: OAuthResolutionRequest,
): Promise<ResolvedOAuthUser> {
  const { identity } = request;
  const linkedUser = await findUserByIdentity(
    userModel,
    request.provider,
    identity.providerAccountId,
  );

  const email = identity.email.toLowerCase();
  const sameEmailUser = linkedUser
    ? undefined
    : await userModel.getByEmail(email);

  // A seat in any workspace, hence CROSS_INSTANCE, is what keeps a provisioned
  // account from being reclaimed as if it were an abandoned draft. The lookup
  // stays out here so decideOAuthResolution remains a pure, DB-free rule.
  const belongsToWorkspace =
    !!sameEmailUser &&
    (await GetModel(TenantMemberModel, CROSS_INSTANCE).existsByUser(
      sameEmailUser._id,
    ));

  const resolution = decideOAuthResolution(
    {
      hasLinkedAccount: Boolean(linkedUser),
      hasAccountWithSameEmail: Boolean(sameEmailUser),
      isSameEmailAccountValidated: Boolean(sameEmailUser?.isValidated),
      hasValidInvitation: request.hasValidInvitation,
      belongsToWorkspace,
    },
    identity,
    request.policy,
  );

  return RESOLUTION_HANDLERS[resolution]({
    userModel,
    identity,
    email,
    language: request.language || DEFAULT_LANGUAGE,
    linkedUser,
    sameEmailUser,
  });
}
