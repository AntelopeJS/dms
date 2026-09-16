import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type User,
  UserExternalIdentityModel,
  type UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import { claimUnvalidatedAccount } from "../../routes/auth/oauth/identity-resolution";
import type { ProviderIdentity } from "../../routes/auth/oauth/providers";

const IDENTITY: ProviderIdentity = {
  providerAccountId: "42",
  email: "alex@acme.dev",
  isEmailVerified: true,
  name: "Alex",
};

function buildUnvalidatedUser(): User {
  return {
    _id: "user-1",
    email: "alex@acme.dev",
    name: "Squatter",
    language: "en",
    password: "squatter-password",
    authKey: "squatter-auth-key",
    isValidated: false,
    validationToken: "ABC123",
    validationRequestedAt: new Date(0),
    forgotPasswordToken: "reset-me",
    forgotPasswordRequestedAt: new Date(0),
    twoFactorMethods: ["totp"],
    twoFactorSecret: "totp-secret",
    twoFactorPendingSecret: "pending-secret",
    twoFactorBackupCodes: ["backup-1"],
    twoFactorEmailCode: "999999",
    twoFactorEmailCodeRequestedAt: new Date(0),
  } as unknown as User;
}

describe("[unit] oauth claim of an unvalidated account", () => {
  async function claim(): Promise<{ user: User; updated: boolean }> {
    const user = buildUnvalidatedUser();
    let updated = false;
    const userModel = {
      update: async () => {
        updated = true;
      },
    } as unknown as UserModel;

    await claimUnvalidatedAccount(userModel, user, IDENTITY, "fr");
    return { user, updated };
  }

  it("persists the claim", async () => {
    const { updated } = await claim();
    expect(updated).to.equal(true);
  });

  it("leaves no credential of the previous holder behind", async () => {
    const { user } = await claim();

    expect(user.password).to.equal(null);
    expect(user.authKey).to.not.equal("squatter-auth-key");
    expect(user.authKey).to.have.length.greaterThan(0);
    expect(user.validationToken).to.equal(null);
    expect(user.validationRequestedAt).to.equal(null);
    expect(user.forgotPasswordToken).to.equal(null);
    expect(user.forgotPasswordRequestedAt).to.equal(null);
  });

  it("leaves no second factor of the previous holder behind", async () => {
    const { user } = await claim();

    expect(user.twoFactorMethods).to.deep.equal([]);
    expect(user.twoFactorSecret).to.equal(null);
    expect(user.twoFactorPendingSecret).to.equal(null);
    expect(user.twoFactorBackupCodes).to.deep.equal([]);
    expect(user.twoFactorEmailCode).to.equal(null);
    expect(user.twoFactorEmailCodeRequestedAt).to.equal(null);
  });

  it("hands the account to the invitee, validated", async () => {
    const { user } = await claim();

    expect(user.isValidated).to.equal(true);
    expect(user.name).to.equal("Alex");
    expect(user.language).to.equal("fr");
  });

  it("leaves no provider binding of the previous holder behind", async () => {
    const identityModel = GetModel(UserExternalIdentityModel);
    await identityModel.insert({
      _id: "google:previous-holder",
      userId: "user-1",
      provider: "google",
      providerAccountId: "previous-holder",
      email: "alex@acme.dev",
      createdAt: new Date(),
      lastLoginAt: new Date(),
    });

    await claim();

    expect(await identityModel.getByUserId("user-1")).to.deep.equal([]);
  });
});
