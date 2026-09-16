import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import type { OAuthPolicy } from "../../routes/auth/oauth/config";
import {
  decideOAuthResolution,
  type OAuthAccountMatch,
} from "../../routes/auth/oauth/linking-policy";
import type { ProviderIdentity } from "../../routes/auth/oauth/providers";

const HTTP_FORBIDDEN = 403;

const NO_MATCH: OAuthAccountMatch = {
  hasLinkedAccount: false,
  hasAccountWithSameEmail: false,
  isSameEmailAccountValidated: false,
  hasValidInvitation: false,
  belongsToWorkspace: false,
};

const CLOSED_POLICY: OAuthPolicy = {
  allowAccountCreation: false,
  linkByVerifiedEmail: true,
};

const VERIFIED_IDENTITY: ProviderIdentity = {
  providerAccountId: "42",
  email: "Alex@Acme.dev",
  isEmailVerified: true,
  name: "Alex",
};

const UNVERIFIED_IDENTITY: ProviderIdentity = {
  ...VERIFIED_IDENTITY,
  isEmailVerified: false,
};

const OPEN_POLICY: OAuthPolicy = {
  allowAccountCreation: true,
  linkByVerifiedEmail: true,
};

function expectRefusal(run: () => unknown, expectedMessage: string): void {
  try {
    run();
  } catch (error: unknown) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(HTTP_FORBIDDEN);
    expect((error as HTTPResult).getBody()).to.equal(expectedMessage);
    return;
  }
  expect.fail(`expected a refusal with "${expectedMessage}"`);
}

describe("[unit] oauth linking policy", () => {
  describe("an already linked provider account", () => {
    it("wins over every other rule, even an unverified e-mail", () => {
      const resolution = decideOAuthResolution(
        { ...NO_MATCH, hasLinkedAccount: true },
        UNVERIFIED_IDENTITY,
        { allowAccountCreation: false, linkByVerifiedEmail: false },
      );
      expect(resolution).to.equal("use-linked");
    });
  });

  describe("an account already holding the same e-mail", () => {
    const sameEmailMatch: OAuthAccountMatch = {
      ...NO_MATCH,
      hasAccountWithSameEmail: true,
      isSameEmailAccountValidated: true,
    };

    it("is linked when the provider verified the e-mail", () => {
      const resolution = decideOAuthResolution(
        sameEmailMatch,
        VERIFIED_IDENTITY,
        OPEN_POLICY,
      );
      expect(resolution).to.equal("link-existing");
    });

    it("is never linked on an unverified provider e-mail", () => {
      expectRefusal(
        () =>
          decideOAuthResolution(
            sameEmailMatch,
            UNVERIFIED_IDENTITY,
            OPEN_POLICY,
          ),
        "error.oauth.email_not_verified",
      );
    });

    it("is never linked while the local account is unvalidated", () => {
      expectRefusal(
        () =>
          decideOAuthResolution(
            { ...sameEmailMatch, isSameEmailAccountValidated: false },
            VERIFIED_IDENTITY,
            OPEN_POLICY,
          ),
        "error.oauth.account_not_validated",
      );
    });

    it("is reclaimed, not joined, when an invitation targets an unvalidated account", () => {
      const resolution = decideOAuthResolution(
        {
          ...sameEmailMatch,
          isSameEmailAccountValidated: false,
          hasValidInvitation: true,
        },
        VERIFIED_IDENTITY,
        CLOSED_POLICY,
      );
      expect(resolution).to.equal("claim-unvalidated");
    });

    // The takeover the password signup already refuses, reached through OAuth: a
    // module provisions a real account without validating its e-mail, so it
    // looks unvalidated, yet a workspace seat proves it is inhabited.
    it("never reclaims an unvalidated account that holds a workspace seat, even with an invitation", () => {
      expectRefusal(
        () =>
          decideOAuthResolution(
            {
              ...sameEmailMatch,
              isSameEmailAccountValidated: false,
              hasValidInvitation: true,
              belongsToWorkspace: true,
            },
            VERIFIED_IDENTITY,
            CLOSED_POLICY,
          ),
        "error.oauth.account_not_validated",
      );
    });

    it("never reclaims a validated account, invitation or not", () => {
      const resolution = decideOAuthResolution(
        { ...sameEmailMatch, hasValidInvitation: true },
        VERIFIED_IDENTITY,
        OPEN_POLICY,
      );
      expect(resolution).to.equal("link-existing");
    });

    it("is never linked when the instance disabled e-mail linking", () => {
      expectRefusal(
        () =>
          decideOAuthResolution(sameEmailMatch, VERIFIED_IDENTITY, {
            allowAccountCreation: true,
            linkByVerifiedEmail: false,
          }),
        "error.oauth.linking_disabled",
      );
    });
  });

  describe("an unknown identity", () => {
    it("creates an account when the instance opted into provider sign-up", () => {
      const resolution = decideOAuthResolution(
        NO_MATCH,
        VERIFIED_IDENTITY,
        OPEN_POLICY,
      );
      expect(resolution).to.equal("create");
    });

    it("creates nothing when provider sign-up is disabled", () => {
      expectRefusal(
        () => decideOAuthResolution(NO_MATCH, VERIFIED_IDENTITY, CLOSED_POLICY),
        "error.oauth.registration_disabled",
      );
    });

    it("creates the invited account even when provider sign-up is disabled", () => {
      const resolution = decideOAuthResolution(
        { ...NO_MATCH, hasValidInvitation: true },
        VERIFIED_IDENTITY,
        CLOSED_POLICY,
      );
      expect(resolution).to.equal("create");
    });

    it("still refuses an invitation carried by an unverified e-mail", () => {
      expectRefusal(
        () =>
          decideOAuthResolution(
            { ...NO_MATCH, hasValidInvitation: true },
            UNVERIFIED_IDENTITY,
            CLOSED_POLICY,
          ),
        "error.oauth.email_not_verified",
      );
    });

    it("creates nothing on an unverified provider e-mail", () => {
      expectRefusal(
        () => decideOAuthResolution(NO_MATCH, UNVERIFIED_IDENTITY, OPEN_POLICY),
        "error.oauth.email_not_verified",
      );
    });
  });
});
