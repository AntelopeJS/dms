import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { expect } from "chai";
import { SetupTokenModel, SystemStateModel } from "../../db";
import { type OAuthPolicy, resolveOAuthUser } from "../../routes/oauth";
import { resetDatabase } from "../helpers/db";
import { createClient } from "../helpers/http";

const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const SETUP_TOKEN = "a-setup-token-of-24-chars";
const OPEN_SIGN_UP: OAuthPolicy = {
  allowAccountCreation: true,
  linkByVerifiedEmail: true,
};

const admin = {
  firstName: "Alice",
  lastName: "Admin",
  email: "alice@bootstrap.test",
  password: "Bootstrap1!",
  platformName: "Platform alice",
  language: "fr",
  setupToken: SETUP_TOKEN,
};

async function seedUnclaimedInstance(): Promise<void> {
  await resetDatabase();
  await GetModel(SystemStateModel).insert({
    has_onboarded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await GetModel(SetupTokenModel).ensure(SETUP_TOKEN);
}

function signUpWithOAuth() {
  return resolveOAuthUser(GetModel(UserModel), {
    provider: "google",
    identity: {
      providerAccountId: "visitor-1",
      email: "visitor@bootstrap.test",
      isEmailVerified: true,
      name: "OAuth Visitor",
    },
    policy: OPEN_SIGN_UP,
    hasValidInvitation: false,
  }).then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function ownerEmails(): Promise<string[]> {
  return (await GetModel(UserModel).getOwners()).map((user) => user.email);
}

describe("[integration] OAuth sign-up before onboarding", () => {
  beforeEach(seedUnclaimedInstance);
  after(seedUnclaimedInstance);

  it("refuses the sign-up and leaves the first admin able to register", async () => {
    const refusal = await signUpWithOAuth();
    const client = createClient();
    const registered = await client.post("/api/onboarding/register", admin);
    const informations = await client.get("/api/onboarding/informations");

    if (!(refusal instanceof HTTPResult)) {
      expect.fail("expected the OAuth sign-up to be refused");
    }
    expect(refusal.getStatus()).to.equal(HTTP_FORBIDDEN);
    expect(refusal.getBody()).to.equal("error.oauth.platform_not_onboarded");
    expect(registered.status).to.equal(HTTP_OK);
    expect(informations.data).to.deep.equal({ has_onboarded: true });
    expect(await ownerEmails()).to.deep.equal([admin.email]);
  });

  it("creates the account once the first admin registered", async () => {
    const registered = await createClient().post(
      "/api/onboarding/register",
      admin,
    );
    const refusal = await signUpWithOAuth();

    expect(registered.status).to.equal(HTTP_OK);
    expect(refusal).to.equal(undefined);
    const visitor = await GetModel(UserModel).getByEmail(
      "visitor@bootstrap.test",
    );
    expect(visitor?.owner).to.equal(false);
    expect(await ownerEmails()).to.deep.equal([admin.email]);
  });
});
