import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import type {
  SessionModel,
  User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { signup } from "../../routes/auth/signup";
import { seedUserInvite } from "../helpers/fixtures";

const HTTP_BAD_REQUEST = 400;
const EMAIL_TAKEN = "error.email_already_used";
const INVALID_TOKEN = "error.invalid_token";
// Deliberately not the tenant the seeded invitations belong to: a seat in any
// workspace makes an account real, which is what reading membership across
// instances buys.
const WORKSPACE_ID = "signup-guard-workspace";
const UNKNOWN_INVITE_TOKEN = "00000000-0000-0000-0000-000000000000";
const INVITEE_NAME = "Invitee";
const INVITEE_PASSWORD = "InviteePassw0rd!";
const HOLDER_NAME = "Rightful Holder";
const HOLDER_PASSWORD = "holder-password-hash";
const HOLDER_AUTH_KEY = "holder-auth-key";
const USER_AGENT = "signup-guard-test";
const IP = "127.0.0.1";

interface SignupAttempt {
  error: unknown;
  updatedUsers: User[];
}

function buildAccount(id: string, email: string, isValidated: boolean): User {
  return {
    _id: id,
    email,
    name: HOLDER_NAME,
    password: HOLDER_PASSWORD,
    authKey: HOLDER_AUTH_KEY,
    isValidated,
    language: "en",
  } as unknown as User;
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

/**
 * Run the signup route against an existing account and report what came back.
 * A signup the guard lets through runs to its very end, where it mints tokens
 * through an interface no unit harness serves — so the writes it performed on
 * the way, not its return value, are what tell the guard let it through.
 */
async function attemptSignup(
  existingUser: User,
  token: string,
  claimedEmail: string = existingUser.email,
): Promise<SignupAttempt> {
  const updatedUsers: User[] = [];
  const userModel = {
    // `UserModel.getByEmail` reads the `email` index, which matches exactly:
    // a lookup that skips normalisation misses the account it is guarding.
    getByEmail: async (lookup: string) =>
      lookup === existingUser.email ? existingUser : undefined,
    get: async () => existingUser,
    getOwners: async () => [],
    update: async (user: User) => {
      updatedUsers.push(user);
    },
    insert: async () => {
      throw new Error("signup must not create a second account");
    },
  } as unknown as UserModel;

  try {
    await signup(
      userModel,
      {} as SessionModel,
      {
        name: INVITEE_NAME,
        email: claimedEmail,
        password: INVITEE_PASSWORD,
        lang: "en",
        token,
      },
      USER_AGENT,
      IP,
    );
  } catch (error) {
    return { error, updatedUsers };
  }
  return { error: undefined, updatedUsers };
}

function expectRefusal(attempt: SignupAttempt, message: string): void {
  expect(attempt.error).to.be.instanceOf(HTTPResult);
  const refusal = attempt.error as HTTPResult;
  expect(refusal.getStatus()).to.equal(HTTP_BAD_REQUEST);
  expect(refusal.getBody()).to.equal(message);
}

describe("[unit] auth/signup — overwriting an existing account", () => {
  // The attack as it was observed: a genuine invitation, sent to the address of
  // an account a module provisioned, used to be answered with that account
  // rewritten and a session handed back.
  it("refuses an unvalidated account that already belongs to a workspace", async () => {
    const provisioned = buildAccount(
      "signup-guard-provisioned",
      "provisioned@acme.dev",
      false,
    );
    await joinWorkspace(provisioned._id);
    const { token } = await seedUserInvite({ email: provisioned.email });

    const attempt = await attemptSignup(provisioned, token);

    expectRefusal(attempt, EMAIL_TAKEN);
    expect(attempt.updatedUsers).to.deep.equal([]);
    expect(provisioned.name).to.equal(HOLDER_NAME);
    expect(provisioned.password).to.equal(HOLDER_PASSWORD);
    expect(provisioned.authKey).to.equal(HOLDER_AUTH_KEY);
  });

  // Accounts are stored lower-cased and the `email` index matches exactly, so
  // a guard reading the address as typed can be walked around by capitalising
  // it — and the signup would then insert a second account on the same address.
  it("refuses the same address claimed in another case", async () => {
    const provisioned = buildAccount(
      "signup-guard-mixed-case",
      "mixed-case@acme.dev",
      false,
    );
    await joinWorkspace(provisioned._id);
    const { token } = await seedUserInvite({ email: provisioned.email });

    const attempt = await attemptSignup(
      provisioned,
      token,
      "Mixed-Case@Acme.dev",
    );

    expectRefusal(attempt, EMAIL_TAKEN);
    expect(attempt.updatedUsers).to.deep.equal([]);
  });

  it("keeps refusing a validated account", async () => {
    const validated = buildAccount(
      "signup-guard-validated",
      "validated@acme.dev",
      true,
    );
    const { token } = await seedUserInvite({ email: validated.email });

    const attempt = await attemptSignup(validated, token);

    expectRefusal(attempt, EMAIL_TAKEN);
    expect(attempt.updatedUsers).to.deep.equal([]);
  });

  it("still takes over a genuine draft: unvalidated and in no workspace", async () => {
    const draft = buildAccount("signup-guard-draft", "draft@acme.dev", false);
    const { token } = await seedUserInvite({ email: draft.email });

    const attempt = await attemptSignup(draft, token);

    expect(attempt.error).to.not.be.instanceOf(HTTPResult);
    expect(attempt.updatedUsers.map((user) => user.name)).to.include(
      INVITEE_NAME,
    );
    expect(draft.authKey).to.not.equal(HOLDER_AUTH_KEY);
  });

  // A draft taken over under a capitalised address must not be stored that
  // way: `login` looks the address up lower-cased and would never find it.
  it("stores the taken-over draft under the canonical address", async () => {
    const draft = buildAccount(
      "signup-guard-draft-case",
      "draft-case@acme.dev",
      false,
    );
    const { token } = await seedUserInvite({ email: draft.email });

    await attemptSignup(draft, token, "Draft-Case@Acme.dev");

    expect(draft.email).to.equal("draft-case@acme.dev");
  });

  // Refusing before the invitation is settled would answer an anonymous prober:
  // one bogus token, two different refusals, and the address is identified.
  it("settles the invitation before disclosing that the address is taken", async () => {
    const provisioned = buildAccount(
      "signup-guard-probed",
      "probed@acme.dev",
      false,
    );
    await joinWorkspace(provisioned._id);

    const attempt = await attemptSignup(provisioned, UNKNOWN_INVITE_TOKEN);

    expectRefusal(attempt, INVALID_TOKEN);
  });
});
