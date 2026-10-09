import { expect } from "chai";
import type {
  SessionModel,
  User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { applyConfig, getAuthConfig } from "../../config";
import { signup } from "../../routes/auth/signup";
import { seedUserInvite } from "../helpers/fixtures";

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

// One id per address: a takeover accepts the invitation, which makes its
// account a workspace member, and a later draft under the same id would then
// be refused as a real account.
function buildDraft(email: string): User {
  return {
    _id: `signup-validation-draft:${email}`,
    email,
    name: "Abandoned draft",
    isValidated: false,
    validationToken: "STALE1",
    validationRequestedAt: new Date(),
    language: "en",
  } as unknown as User;
}

/**
 * Run a signup through an invitation and return the account it wrote. The
 * route runs on past the write into interfaces no unit harness serves, so its
 * outcome is read from the account, not from its answer.
 */
async function signUpThroughInvite(scenario: SignupScenario): Promise<User> {
  let account: User | undefined = scenario.existingDraft;
  const newUserId = `signup-validation:${scenario.email}`;
  const userModel = {
    getByEmail: async () => scenario.existingDraft,
    get: async () => account,
    getOwners: async () => [],
    insert: async (row: Partial<User>) => {
      account = { ...row, _id: newUserId } as User;
      return [newUserId];
    },
    update: async (user: User) => {
      account = user;
    },
  } as unknown as UserModel;
  // The fixture skips validation by default; the invitation here must not,
  // or a signup left to its validation round would read as validated.
  const { token } = await seedUserInvite({
    email: scenario.email,
    skipEmailValidation: false,
  });

  await signup(
    userModel,
    {} as SessionModel,
    {
      name: INVITEE_NAME,
      email: scenario.email,
      password: INVITEE_PASSWORD,
      token,
    },
    USER_AGENT,
    { ip: IP },
  ).catch(() => undefined);

  expect(account, "signup wrote no account").to.not.equal(undefined);
  return account as User;
}

function expectValidated(account: User): void {
  expect(account.isValidated).to.equal(true);
  expect(account.validationToken).to.equal(null);
  expect(account.validationRequestedAt).to.equal(null);
}

describe("[unit] auth/signup — email validation of an invited account", () => {
  afterEach(() => setEmailValidation(false));

  describe("on an instance that does not validate emails", () => {
    // Nothing would ever validate such an account: it kept the "Email not
    // verified" badge for good, and resending the email always failed.
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

  // The invitation link proves the address (an admin who copies it by hand
  // vouches for it): no second validation round follows the signup.
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
