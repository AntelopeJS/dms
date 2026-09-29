import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { UserInviteModel } from "@antelopejs/interface-dms/db/models";
import { createUserInviteToken } from "@antelopejs/interface-dms/invites";
import {
  normalizeEmail,
  UserModel,
} from "@antelopejs/interface-dms/auth/db/models";

const STORED_EMAIL = "email-normalization-user@acme.dev";
const TYPED_EMAIL = "  Email-Normalization-User@ACME.dev ";
const INVITE_TYPED_EMAIL = "Email-Normalization-Invitee@Acme.dev";
const INVITE_STORED_EMAIL = "email-normalization-invitee@acme.dev";

describe("[unit] e-mail normalization — lookups and writes share one form", () => {
  const userModel = GetModel(UserModel);
  const inviteModel = GetModel(UserInviteModel, DEFAULT_TENANT_ID);
  let userId: string;

  before(async () => {
    [userId] = await userModel.insert({
      name: "Normalized",
      email: STORED_EMAIL,
      password: null,
      authKey: randomUUID(),
      isValidated: true,
      owner: false,
      language: "en",
    });
  });

  after(async () => {
    await userModel.delete(userId);
    const invites = await inviteModel.table
      .getAll(INVITE_STORED_EMAIL, "email")
      .run();
    for (const invite of invites) await inviteModel.delete(invite._id);
  });

  it("trims and lowercases", () => {
    expect(normalizeEmail(TYPED_EMAIL)).to.equal(STORED_EMAIL);
  });

  it("finds a user whatever the casing of the lookup", async () => {
    const user = await userModel.getByEmail(TYPED_EMAIL);
    expect(user?._id).to.equal(userId);
  });

  it("stores an invitation lowercased and finds it by any casing", async () => {
    const { inviteId } = await createUserInviteToken({
      tenantId: DEFAULT_TENANT_ID,
      email: INVITE_TYPED_EMAIL,
      language: "en",
      roleIds: [],
      asTenantOwner: false,
      skipEmailValidation: false,
    });

    const stored = await inviteModel.get(inviteId);
    expect(stored?.email).to.equal(INVITE_STORED_EMAIL);
    const found = await inviteModel.getByEmail(INVITE_TYPED_EMAIL);
    expect(found?._id).to.equal(inviteId);
  });
});
