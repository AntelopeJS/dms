import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import { assert, expect } from "chai";
import { SetupTokenModel, SystemStateModel } from "../../../db";
import { generateAuthKey } from "../../../utils";
import { authorizedClient, loginUser, registerUser } from "../../helpers/auth";
import { resetDatabase } from "../../helpers/db";
import { expectNoStall, loopStallDuring } from "../../helpers/event-loop";
import { seedUserInvite } from "../../helpers/fixtures";
import { createClient } from "../../helpers/http";

const HTTP_OK = 200;
const HTTP_MULTIPLE_CHOICES = 300;
const HTTP_BAD_REQUEST = 400;
const SECOND_SIGNUP_DELAY_MS = 60;
const SECURITY = pageRoutePath("/settings/user/security");
const SETUP_TOKEN = "a-setup-token-of-24-chars";
const FIRST_PASSWORD = "FirstPassw0rd!";
const NEXT_PASSWORD = "NextPassw0rd26!";
const CURRENT_SCRYPT =
  /^\$scrypt\$ln=15,r=8,p=3\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
const TEST_TIMEOUT_MS = 20_000;

/** A password and its hash, as the 0.2 `@Hashed` setter stored them. */
const PRE_ASYNC_PASSWORD = "Before030Pw!";
const PRE_ASYNC_HASH =
  "$scrypt$ln=15,r=8,p=3$dOXLkRQvY9bDMRqA1HlyZA$Zdt7BNlZ+zT74dLVdI6eUhgYlKa71atZlyRbvjaL5Rw";

async function reload(userId: string) {
  const user = await GetModel(UserModel).get(userId);
  if (!user) throw new Error(`User ${userId} not found`);
  return user;
}

async function expectStoredPassword(
  userId: string,
  password: string,
  replaced?: string,
): Promise<void> {
  const user = await reload(userId);
  expect(user.password).to.match(CURRENT_SCRYPT);
  expect(await user.testHashAsync("password", password)).to.equal(true);
  if (replaced !== undefined) {
    expect(await user.testHashAsync("password", replaced)).to.equal(false);
  }
}

async function unclaimedInstance(): Promise<void> {
  await resetDatabase();
  await GetModel(SystemStateModel).insert({
    has_onboarded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await GetModel(SetupTokenModel).ensure(SETUP_TOKEN);
}

async function insertDraft(email: string): Promise<string> {
  const [draftId] = await GetModel(UserModel).insert({
    createdAt: new Date(),
    updatedAt: new Date(),
    name: "Abandoned draft",
    email,
    password: FIRST_PASSWORD,
    authKey: generateAuthKey(),
    isValidated: false,
    owner: false,
    language: "en",
  });
  assert.isString(draftId);
  return draftId;
}

describe("[integration] auth/password writes off the event loop", function () {
  this.timeout(TEST_TIMEOUT_MS);

  beforeEach(resetDatabase);

  it("signup stores a hash of the chosen password", async () => {
    const { result, stallMs } = await loopStallDuring(() =>
      registerUser({ password: FIRST_PASSWORD }),
    );

    expectNoStall(stallMs);
    await expectStoredPassword(result.userId, FIRST_PASSWORD);
    await loginUser(result.email, FIRST_PASSWORD);
  });

  it("signup over an unvalidated draft replaces its password", async () => {
    const email = `draft-${Date.now()}@test.local`;
    const draftId = await insertDraft(email);
    const { token } = await seedUserInvite({ email });

    const { result, stallMs } = await loopStallDuring(() =>
      createClient().post("/api/auth/signup", {
        name: "Invitee",
        email,
        password: NEXT_PASSWORD,
        lang: "en",
        token,
      }),
    );

    expect(result.status, JSON.stringify(result.data)).to.equal(HTTP_OK);
    expectNoStall(stallMs);
    await expectStoredPassword(draftId, NEXT_PASSWORD, FIRST_PASSWORD);
    await loginUser(email, NEXT_PASSWORD);
  });

  it("refuses a second signup for the address while the first one hashes", async () => {
    const email = `twice-${Date.now()}@test.local`;
    const { token } = await seedUserInvite({ email });
    const body = {
      name: "Invitee",
      email,
      password: FIRST_PASSWORD,
      lang: "en",
      token,
    };

    const first = createClient().post("/api/auth/signup", body);
    await new Promise((resolve) => setTimeout(resolve, SECOND_SIGNUP_DELAY_MS));
    const second = createClient().post("/api/auth/signup", body);
    const statuses = (await Promise.all([first, second])).map((r) => r.status);

    expect(statuses).to.deep.equal([HTTP_OK, HTTP_BAD_REQUEST]);
    const rows = await GetModel(UserModel).getBy("email", email);
    expect(rows).to.have.length(1);
  });

  it("password reset stores a hash of the new password", async () => {
    const user = await registerUser({ password: FIRST_PASSWORD });
    await createClient().post("/api/auth/forgot-password", {
      email: user.email,
    });
    const token = (await reload(user.userId)).forgotPasswordToken;
    assert.isString(token);

    const { result, stallMs } = await loopStallDuring(() =>
      createClient().post("/api/auth/reset-password", {
        email: user.email,
        token,
        password: NEXT_PASSWORD,
      }),
    );

    expect(result.status, JSON.stringify(result.data)).to.be.below(
      HTTP_MULTIPLE_CHOICES,
    );
    expectNoStall(stallMs);
    await expectStoredPassword(user.userId, NEXT_PASSWORD, FIRST_PASSWORD);
    await loginUser(user.email, NEXT_PASSWORD);
  });
});

describe("[integration] auth/password writes off the event loop, change and onboarding", function () {
  this.timeout(TEST_TIMEOUT_MS);

  beforeEach(resetDatabase);

  it("password change stores a hash of the new password", async () => {
    const user = await registerUser({ password: FIRST_PASSWORD, owner: true });

    const { result, stallMs } = await loopStallDuring(() =>
      authorizedClient(user.accessToken).post(`${SECURITY}/password`, {
        currentPassword: FIRST_PASSWORD,
        password: NEXT_PASSWORD,
      }),
    );

    expect(result.status, JSON.stringify(result.data)).to.equal(HTTP_OK);
    expectNoStall(stallMs);
    await expectStoredPassword(user.userId, NEXT_PASSWORD, FIRST_PASSWORD);
    await loginUser(user.email, NEXT_PASSWORD);
  });

  it("signs in an account whose hash the 0.2 setter wrote", async () => {
    const user = await registerUser({ password: FIRST_PASSWORD });
    const stored = await reload(user.userId);
    await GetModel(UserModel).update(
      Object.assign(stored, {
        _internal: { meta: {}, data: { password: PRE_ASYNC_HASH } },
      }),
    );

    await loginUser(user.email, PRE_ASYNC_PASSWORD);
    expect((await reload(user.userId)).password).to.equal(PRE_ASYNC_HASH);
  });

  describe("onboarding", () => {
    beforeEach(unclaimedInstance);
    after(async () => {
      await resetDatabase();
      await GetModel(SystemStateModel).insert({
        has_onboarded: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it("stores a hash of the first owner's password", async () => {
      const email = "owner@test.local";
      const { result, stallMs } = await loopStallDuring(() =>
        createClient().post("/api/onboarding/register", {
          firstName: "Camille",
          lastName: "Laurent",
          email,
          password: FIRST_PASSWORD,
          setupToken: SETUP_TOKEN,
        }),
      );

      expect(result.status, JSON.stringify(result.data)).to.equal(HTTP_OK);
      expectNoStall(stallMs);
      const owner = await GetModel(UserModel).getByEmail(email);
      assert.exists(owner);
      await expectStoredPassword(owner._id, FIRST_PASSWORD);
      await loginUser(email, FIRST_PASSWORD);
    });
  });
});
