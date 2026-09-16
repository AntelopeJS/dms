import { assert, assertValidation } from "@antelopejs/interface-api-util";
import {
  announceRegistration,
  linkExternalIdentity,
} from "@antelopejs/interface-dms/auth";
import type {
  SessionModel,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { notifyLoginMethodAdded } from "../../../utils/account-notifications";
import { authSchema } from "../../../validation/auth.schema";
import { consumeInvite, resolveValidInvite } from "../invite";
import { type LoginOutcome, resolveLoginOutcome } from "../session-response";
import { getEnabledOAuthProvider, resolveOAuthPolicy } from "./config";
import { resolveOAuthUser } from "./identity-resolution";
import { assertValidOAuthState } from "./state";
import { exchangeCodeForAccessToken } from "./token-exchange";

const HTTP_FORBIDDEN = 403;
const EMAIL_NOT_VERIFIED_MESSAGE = "error.oauth.email_not_verified";

/**
 * Complete a provider round-trip and turn it into a login outcome.
 *
 * The account is resolved and the identity bound before any session is
 * issued, so an OAuth login lands on the same second-factor and workspace
 * checks as a password login. An invitation token travelling with the flow is
 * consumed here too, so accepting an invitation with a provider account grants
 * the same membership as accepting it with a password; it is validated against
 * the provider e-mail before any account is touched, so a mismatch leaves
 * nothing behind, and only a provider-verified e-mail may redeem one — the
 * same bar every other invitation-driven resolution sets, applied here even
 * for an already-linked account whose plain login skips that check. Linking a provider to an account that predates it raises a
 * security notification to its owner, like the other credential changes do.
 *
 * @param userModel Users model
 * @param sessionModel Sessions model
 * @param providerId Provider handling the callback
 * @param body Callback payload relayed by the browser-facing layer
 * @param userAgent Requesting user agent
 * @param ip Requesting IP
 * @returns Session, two-factor challenge, or tenant assignment handover
 */
/** One OAuth return trip. */
export interface OAuthCallbackInput {
  userModel: UserModel;
  sessionModel: SessionModel;
  providerId: string;
  body: unknown;
  userAgent: string;
  ip: string;
}

export async function oauthCallback({
  userModel,
  sessionModel,
  providerId,
  body,
  userAgent,
  ip,
}: OAuthCallbackInput): Promise<LoginOutcome> {
  const payload = assertValidation(body, (v) =>
    authSchema.oauthCallback.parse(v),
  );
  const enabled = getEnabledOAuthProvider(providerId);
  assertValidOAuthState(payload.state, payload.state_cookie, providerId);

  const accessToken = await exchangeCodeForAccessToken(enabled, payload.code);
  const identity = await enabled.provider.fetchIdentity(accessToken);

  if (payload.invite) {
    assert(
      identity.isEmailVerified,
      HTTP_FORBIDDEN,
      EMAIL_NOT_VERIFIED_MESSAGE,
    );
  }
  const resolvedInvite = payload.invite
    ? await resolveValidInvite(payload.invite, identity.email)
    : undefined;

  const { user, isRegistration } = await resolveOAuthUser(userModel, {
    provider: providerId,
    identity,
    policy: resolveOAuthPolicy(),
    hasValidInvitation: Boolean(resolvedInvite),
    language: payload.language,
  });

  const { wasCreated } = await linkExternalIdentity(user._id, {
    provider: providerId,
    providerAccountId: identity.providerAccountId,
    email: identity.email,
  });

  if (wasCreated && !isRegistration) {
    void notifyLoginMethodAdded(user._id, enabled.provider.displayName);
  }

  if (resolvedInvite) {
    await consumeInvite(userModel, user._id, resolvedInvite);
    if (isRegistration) {
      await announceRegistration(userModel, user, resolvedInvite.tenantId);
    }
  }

  return resolveLoginOutcome(
    sessionModel,
    user,
    userAgent,
    ip,
    resolvedInvite?.tenantId,
  );
}
