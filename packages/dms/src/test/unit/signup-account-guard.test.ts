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
  error: PromiseRejectedResult["reason"];
  updatedUsers: User[];
}

function buildAccount(id: string, email: string, isValidated: boolean): User {
  // SAFETY: Signup's account guard and draft takeover read or replace these plain fields; the fixture does not implement persisted-row methods.
  return {
    _id: id,
    email,
    name: HOLDER_NAME,
    password: HOLDER_PASSWORD,
    authKey: HOLDER_AUTH_KEY,
    isValidated,
    language: "en",
  } as User;
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
  lang?: string,
): Promise<SignupAttempt> {
  const updatedUsers: User[] = [];
  // SAFETY: The harness implements signup's account lookups and records writes; unsupported downstream token interfaces may fail after those writes and are deliberately captured below.
  const userModel = {
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
      // SAFETY: This deliberately unimplemented session model is not a working persistence model; the harness observes guard refusal or earlier user writes and captures downstream failures.
      {} as SessionModel,
      {
        name: INVITEE_NAME,
        email: claimedEmail,
        password: INVITEE_PASSWORD,
        lang,
        token,
      },
      USER_AGENT,
      { ip: IP },
    );
  } catch (error: PromiseRejectedResult["reason"]) {
    return { error, updatedUsers };
  }
  return { error: undefined, updatedUsers };
}

function expectRefusal(attempt: SignupAttempt, message: string): void {
  expect(attempt.error).to.be.instanceOf(HTTPResult);
  const refusal = attempt.error;
  expect(refusal.getStatus()).to.equal(HTTP_BAD_REQUEST);
  expect(refusal.getBody()).to.equal(message);
}

describe("[unit] auth/signup — overwriting an existing account", () => {
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

  it("takes over a draft in the invitation's language when none is chosen", async () => {
    const draft = buildAccount(
      "signup-guard-draft-language",
      "draft-language@acme.dev",
      false,
    );
    const { token } = await seedUserInvite({
      email: draft.email,
      language: "fr",
    });

    await attemptSignup(draft, token);

    expect(draft.language).to.equal("fr");
  });

  it("keeps the language the invitee chose over the invitation's", async () => {
    const draft = buildAccount(
      "signup-guard-draft-chosen-language",
      "draft-chosen-language@acme.dev",
      false,
    );
    const { token } = await seedUserInvite({
      email: draft.email,
      language: "fr",
    });

    await attemptSignup(draft, token, draft.email, "en");

    expect(draft.language).to.equal("en");
  });

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
