import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { assert, expect } from "chai";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { assertEmailAvailable } from "../../../../pages/account";
import { storedUserFixture } from "../../../helpers/user-fixture";

const HTTP_CONFLICT = 409;
const EMAIL_TAKEN = "error.email_already_used";
const CURRENT_USER_ID = "profile-email-current";
const OTHER_USER_ID = "profile-email-other";
const OTHER_EMAIL = "holder@acme.dev";
const FREE_EMAIL = "free@acme.dev";
const OWN_EMAIL = "mine@acme.dev";

class HoldingUserModel extends UserModel {
  private readonly ids: ReadonlyMap<string, string>;

  constructor(accounts: Record<string, string>) {
    super(GetModel(UserModel).database);
    this.ids = new Map(Object.entries(accounts));
  }

  override async getByEmail(lookup: string): Promise<User | undefined> {
    const email = lookup.trim().toLowerCase();
    const id = this.ids.get(email);
    return id ? storedUserFixture({ _id: id, email }) : undefined;
  }
}

function modelHolding(accounts: Record<string, string>): UserModel {
  return new HoldingUserModel(accounts);
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
