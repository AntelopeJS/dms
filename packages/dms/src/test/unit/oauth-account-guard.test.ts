import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import type { User } from "@antelopejs/interface-dms/auth/db";
import type { OAuthPolicy, ProviderIdentity } from "../../routes/oauth";
import { resolveOAuthUser } from "../../routes/oauth";
import { SingleAccountUserModel } from "../helpers/recording-user-model";
import { plainPasswordUserFixture } from "../helpers/user-fixture";

const HTTP_FORBIDDEN = 403;
const ACCOUNT_NOT_VALIDATED = "error.oauth.account_not_validated";

const WORKSPACE_ID = "oauth-guard-workspace";
const PROVIDER = "google";
const HOLDER_NAME = "Rightful Holder";
const HOLDER_PASSWORD = "holder-password-hash";
const HOLDER_AUTH_KEY = "holder-auth-key";

const CLOSED_POLICY: OAuthPolicy = {
  allowAccountCreation: false,
  linkByVerifiedEmail: true,
};

function buildUnvalidatedAccount(id: string, email: string): User {
  return plainPasswordUserFixture({
    _id: id,
    email,
    name: HOLDER_NAME,
    password: HOLDER_PASSWORD,
    authKey: HOLDER_AUTH_KEY,
    isValidated: false,
    language: "en",
  });
}

function buildIdentity(email: string): ProviderIdentity {
  return {
    providerAccountId: "oauth-guard-42",
    email,
    isEmailVerified: true,
    name: "Invitee",
  };
}

async function joinWorkspace(userId: string): Promise<void> {
  await GetModel(TenantMemberModel, WORKSPACE_ID).insert({
    _id: `${WORKSPACE_ID}:${userId}`,
    userId,
    roleIds: [],
    isTenantOwner: false,
    joinedAt: new Date(),
    invitedBy: null,
  });
}

interface ResolveAttempt {
  error: unknown;
  result: Awaited<ReturnType<typeof resolveOAuthUser>> | undefined;
  updatedUsers: User[];
}

/**
 * Drive the OAuth resolution against an existing account, carrying a valid
 * invitation, and report what came back — the claim path rewrites the account
 * through `update`, so a recorded write is what tells the claim went through.
 */
async function attemptResolve(existingUser: User): Promise<ResolveAttempt> {
  const userModel = new SingleAccountUserModel(existingUser);
  const { updated: updatedUsers } = userModel;

  try {
    const result = await resolveOAuthUser(userModel, {
      provider: PROVIDER,
      identity: buildIdentity(existingUser.email),
      policy: CLOSED_POLICY,
      hasValidInvitation: true,
      language: "fr",
    });
    return { error: undefined, result, updatedUsers };
  } catch (error: unknown) {
    return { error, result: undefined, updatedUsers };
  }
}

describe("[unit] auth/oauth — claiming an existing account", () => {
  it("refuses an unvalidated account that already belongs to a workspace", async () => {
    const provisioned = buildUnvalidatedAccount(
      "oauth-guard-provisioned",
      "provisioned@acme.dev",
    );
    await joinWorkspace(provisioned._id);

    const attempt = await attemptResolve(provisioned);

    const refusal = attempt.error;
    if (!(refusal instanceof HTTPResult)) {
      expect.fail("expected an HTTPResult refusal");
    }
    expect(refusal.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(refusal.getBody()).to.equal(ACCOUNT_NOT_VALIDATED);
    expect(attempt.updatedUsers).to.deep.equal([]);
    expect(provisioned.password).to.equal(HOLDER_PASSWORD);
    expect(provisioned.authKey).to.equal(HOLDER_AUTH_KEY);
  });

  it("still reclaims a genuine draft: unvalidated and in no workspace", async () => {
    const draft = buildUnvalidatedAccount(
      "oauth-guard-draft",
      "draft@acme.dev",
    );

    const attempt = await attemptResolve(draft);

    expect(attempt.error).to.equal(undefined);
    expect(attempt.result?.isRegistration).to.equal(true);
    expect(attempt.updatedUsers).to.have.length.greaterThan(0);
    expect(draft.authKey).to.not.equal(HOLDER_AUTH_KEY);
  });
});
