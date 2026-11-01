import { HTTPResult } from "@antelopejs/interface-api";
import { assert, expect } from "chai";
import type { UserModel } from "@antelopejs/interface-dms/auth/db";
import { assertEmailAvailable } from "../../../../pages/account";
import { userFixture } from "../../../helpers/user-fixture";

const HTTP_CONFLICT = 409;
const EMAIL_TAKEN = "error.email_already_used";
const CURRENT_USER_ID = "profile-email-current";
const OTHER_USER_ID = "profile-email-other";
const OTHER_EMAIL = "holder@acme.dev";
const FREE_EMAIL = "free@acme.dev";
const OWN_EMAIL = "mine@acme.dev";

function modelHolding(accounts: Record<string, string>): UserModel {
  // SAFETY: assertEmailAvailable calls only getByEmail and reads only the returned _id; omitted model methods and user fields are never used.
  return {
    getByEmail: async (lookup: string) => {
      const id = accounts[lookup.trim().toLowerCase()];
      return id ? userFixture({ _id: id }) : undefined;
    },
  } as UserModel;
}

async function attempt(
  userModel: UserModel,
  email: string,
): Promise<string | HTTPResult> {
  try {
    return await assertEmailAvailable(userModel, email, CURRENT_USER_ID);
  } catch (error) {
    if (error instanceof HTTPResult) return error;
    throw error;
  }
}

describe("[unit] profile — e-mail change is refused for an address another account holds", () => {
  const userModel = modelHolding({
    [OTHER_EMAIL]: OTHER_USER_ID,
    [OWN_EMAIL]: CURRENT_USER_ID,
  });

  it("refuses another account's address, whatever its casing", async () => {
    const result = await attempt(userModel, " Holder@ACME.dev ");
    assert.instanceOf(result, HTTPResult);
    expect(result.getStatus()).to.equal(HTTP_CONFLICT);
    expect(result.getBody()).to.equal(EMAIL_TAKEN);
  });

  it("accepts a free address, normalized", async () => {
    expect(await attempt(userModel, "Free@Acme.dev")).to.equal(FREE_EMAIL);
  });

  it("accepts the user's own address", async () => {
    expect(await attempt(userModel, "Mine@acme.dev")).to.equal(OWN_EMAIL);
  });
});
