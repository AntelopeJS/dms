import { GetModel } from "@antelopejs/interface-database-decorators";
import { assert, expect } from "chai";
import {
  SessionModel,
  User,
  type UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { applyConfig, getAuthConfig } from "../../config";
import { signup } from "../../routes/authentication";
import { seedUserInvite } from "../helpers/fixtures";
import { RecordingUserModel } from "../helpers/recording-user-model";
import { userFixture } from "../helpers/user-fixture";

const INVITEE_NAME = "Invitee";
const INVITEE_PASSWORD = "InviteePassw0rd!";
const USER_AGENT = "signup-validation-test";
const IP = "127.0.0.1";

function setEmailValidation(mustValidateEmail: boolean): void {
  applyConfig({ auth: { ...getAuthConfig(), mustValidateEmail } });
}

interface SignupScenario {
  email: string;
  existingDraft?: User;
}

function buildDraft(email: string): User {
  return userFixture({
    _id: `signup-validation-draft:${email}`,
    email,
    name: "Abandoned draft",
    isValidated: false,
    validationToken: "STALE1",
    validationRequestedAt: new Date(),
    language: "en",
  });
}

/** Answers signup's account lookups and keeps the account it last wrote. */
class CapturingUserModel extends RecordingUserModel {
  account: User | undefined;

  constructor(
    private readonly existingDraft: User | undefined,
    private readonly newUserId: string,
  ) {
    super();
    this.account = existingDraft;
  }

  override async getByEmail(): Promise<User | undefined> {
    return this.existingDraft;
  }

  override async get(): Promise<User | undefined> {
    return this.account;
  }

  override async getOwners(): Promise<User[]> {
    return [];
  }

  override async insert(
    ...[row]: Parameters<UserModel["insert"]>
  ): Promise<string[]> {
    if (!(row instanceof User)) {
      throw new Error("signup inserted a row that is not a User");
    }
    row._id = this.newUserId;
    this.account = row;
    return [this.newUserId];
  }

  override async update(
    ...args: Parameters<RecordingUserModel["update"]>
  ): Promise<number> {
    const [user] = args;
    if (user instanceof User) this.account = user;
    return super.update(...args);
  }
}

/**
 * Run a signup through an invitation and return the account it wrote. The
 * route runs on past the write into interfaces no unit harness serves, so its
 * outcome is read from the account, not from its answer.
 */
async function signUpThroughInvite(scenario: SignupScenario): Promise<User> {
  const userModel = new CapturingUserModel(
    scenario.existingDraft,
    `signup-validation:${scenario.email}`,
  );

  const { token } = await seedUserInvite({
    email: scenario.email,
  });

  await signup(
    userModel,
    GetModel(SessionModel),
    {
      name: INVITEE_NAME,
      email: scenario.email,
      password: INVITEE_PASSWORD,
      token,
    },
    USER_AGENT,
    { ip: IP },
  ).catch(() => undefined);

  const { account } = userModel;
  assert.isDefined(account, "signup wrote no account");
  return account;
}

function expectValidated(account: User): void {
  expect(account.isValidated).to.equal(true);
  expect(account.validationToken).to.equal(null);
  expect(account.validationRequestedAt).to.equal(null);
}

describe("[unit] auth/signup — email validation of an invited account", () => {
  afterEach(() => setEmailValidation(false));

  describe("on an instance that does not validate emails", () => {
    it("marks the new account verified", async () => {
      expectValidated(
        await signUpThroughInvite({ email: "validation-off@acme.dev" }),
      );
    });

    it("marks a taken-over draft verified", async () => {
      const email = "validation-off-draft@acme.dev";
      expectValidated(
        await signUpThroughInvite({ email, existingDraft: buildDraft(email) }),
      );
    });
  });

  describe("on an instance that validates emails", () => {
    beforeEach(() => setEmailValidation(true));

    it("marks the new account verified", async () => {
      expectValidated(
        await signUpThroughInvite({ email: "validation-on@acme.dev" }),
      );
    });

    it("marks a taken-over draft verified and drops its pending token", async () => {
      const email = "validation-on-draft@acme.dev";
      expectValidated(
        await signUpThroughInvite({ email, existingDraft: buildDraft(email) }),
      );
    });
  });
});
