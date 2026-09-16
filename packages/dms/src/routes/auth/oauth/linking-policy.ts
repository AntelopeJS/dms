import { assert } from "@antelopejs/interface-api-util";
import type { OAuthPolicy } from "./config";
import type { ProviderIdentity } from "./providers";

const HTTP_FORBIDDEN = 403;
const REGISTRATION_DISABLED_MESSAGE = "error.oauth.registration_disabled";
const EMAIL_NOT_VERIFIED_MESSAGE = "error.oauth.email_not_verified";
const LINKING_DISABLED_MESSAGE = "error.oauth.linking_disabled";
const ACCOUNT_NOT_VALIDATED_MESSAGE = "error.oauth.account_not_validated";

/**
 * What a provider identity is allowed to do with the accounts it matched.
 */
export type OAuthResolution =
  | "use-linked"
  | "link-existing"
  | "claim-unvalidated"
  | "create";

/**
 * State of the accounts a provider identity matched, without any of the
 * lookups that produced it.
 */
export interface OAuthAccountMatch {
  hasLinkedAccount: boolean;
  /**
   * Whether an account already owns the e-mail the provider reports.
   */
  hasAccountWithSameEmail: boolean;
  /**
   * Whether that account validated its e-mail address.
   */
  isSameEmailAccountValidated: boolean;
  /**
   * Whether the identity carries an invitation already validated against the
   * e-mail the provider reports.
   */
  hasValidInvitation: boolean;
  /**
   * Whether that account already holds a seat in a workspace — any instance.
   * A seat marks a real, inhabited account, so the row is never reclaimed even
   * when it never validated its e-mail.
   */
  belongsToWorkspace: boolean;
}

/**
 * Decide what an incoming provider identity may do, and refuse loudly
 * otherwise.
 *
 * Kept free of any lookup so the rules stay reviewable and testable on their
 * own — this is the security core of the OAuth flow:
 * 1. an already linked provider account always wins, because provider e-mails
 *    change while provider account ids do not;
 * 2. an account holding the same e-mail is only adopted when the provider
 *    vouches for that e-mail and the local account is validated, making control
 *    of the mailbox the single prerequisite for linking — the same bar the
 *    password-reset flow already sets;
 * 3. an unvalidated account holding that e-mail is never adopted as it stands,
 *    because nobody proved they own it. An invitation reclaims it instead — but
 *    never once it holds a workspace seat, which marks a real account a module
 *    provisioned without ever running e-mail validation, exactly as the
 *    password signup refuses to overwrite it. The caller must wipe the
 *    credentials of a reclaimed draft, mirroring how a password signup
 *    overwrites an unvalidated account rather than joining it;
 * 4. an unknown identity may only create an account when the instance opted
 *    into provider registration **or** when it carries a valid invitation —
 *    an invitation is already the permission to join, exactly as it is for a
 *    password signup — and only on a provider-verified e-mail.
 *
 * @param match Accounts the identity matched
 * @param identity Identity reported by the provider
 * @param policy Instance linking and registration policy
 * @returns The permitted resolution
 */
export function decideOAuthResolution(
  match: OAuthAccountMatch,
  identity: ProviderIdentity,
  policy: OAuthPolicy,
): OAuthResolution {
  if (match.hasLinkedAccount) {
    return "use-linked";
  }

  if (match.hasAccountWithSameEmail) {
    assert(
      identity.isEmailVerified,
      HTTP_FORBIDDEN,
      EMAIL_NOT_VERIFIED_MESSAGE,
    );

    if (!match.isSameEmailAccountValidated) {
      assert(
        match.hasValidInvitation,
        HTTP_FORBIDDEN,
        ACCOUNT_NOT_VALIDATED_MESSAGE,
      );
      // A seat in any workspace marks a real, inhabited account, not the
      // abandoned draft a claim is meant for: reclaiming it would wipe its
      // credentials and hand a live session to whoever holds an invitation for
      // the address. `isValidated` cannot tell the two apart, because a module
      // can provision a real account without ever running e-mail validation —
      // the same guard the password signup applies in resolveOverwritableAccount.
      // The refusal reuses the not-validated message so it never discloses that
      // the address is a provisioned account.
      assert(
        !match.belongsToWorkspace,
        HTTP_FORBIDDEN,
        ACCOUNT_NOT_VALIDATED_MESSAGE,
      );
      return "claim-unvalidated";
    }

    assert(
      policy.linkByVerifiedEmail,
      HTTP_FORBIDDEN,
      LINKING_DISABLED_MESSAGE,
    );
    return "link-existing";
  }

  assert(
    policy.allowAccountCreation || match.hasValidInvitation,
    HTTP_FORBIDDEN,
    REGISTRATION_DISABLED_MESSAGE,
  );
  assert(identity.isEmailVerified, HTTP_FORBIDDEN, EMAIL_NOT_VERIFIED_MESSAGE);
  return "create";
}
