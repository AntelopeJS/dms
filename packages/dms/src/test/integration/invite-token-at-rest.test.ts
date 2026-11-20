import { strict as assert } from "node:assert";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserInviteModel } from "@antelopejs/interface-dms/db";
import { InviteResolutionsModel } from "@antelopejs/interface-dms/db/internal/inviteResolutions.model";
import {
  type CreateUserInviteTokenOptions,
  createUserInviteToken,
} from "@antelopejs/interface-dms/invites";
import { copyInviteLink } from "../../pages/members";
import { resetDatabase } from "../helpers/db";

const TENANT = "invite-token-at-rest-tenant";

const OPTIONS: CreateUserInviteTokenOptions = {
  tenantId: TENANT,
  email: "at-rest@example.test",
  language: "en",
  roleIds: [],
  asTenantOwner: false,
};

/** Every invitation row and invitation decision the tenant stores, as text. */
async function storedText(): Promise<string> {
  const invites = await GetModel(UserInviteModel, TENANT).getAll();
  const decisions = await GetModel(InviteResolutionsModel, TENANT).getAll();
  return JSON.stringify([invites, decisions]);
}

async function created(): Promise<{ inviteId: string; token: string }> {
  const { inviteId, token } = await createUserInviteToken(OPTIONS);
  assert.ok(token, "the call that creates an invitation receives its token");
  return { inviteId, token };
}

async function invitationHolding(token: string): Promise<string | undefined> {
  return (await GetModel(UserInviteModel, TENANT).getByToken(token))?._id;
}

describe("[integration] invitation tokens at rest", () => {
  beforeEach(resetDatabase);

  it("stores no token in clear, and finds the invitation by the token its link carries", async () => {
    const { inviteId, token } = await created();

    assert.ok(!(await storedText()).includes(token));
    assert.equal(await invitationHolding(token), inviteId);
  });

  it("keeps no token in clear in the decision that retires a resent invitation", async () => {
    const first = await created();
    const invite = await GetModel(UserInviteModel, TENANT).get(first.inviteId);
    const resent = await createUserInviteToken({
      ...OPTIONS,
      replacesInvite: invite,
      replacementReason: "resent",
    });
    assert.ok(resent.token);

    const stored = await storedText();
    assert.ok(!stored.includes(first.token));
    assert.ok(!stored.includes(resent.token));
    assert.equal(await invitationHolding(first.token), undefined);
    assert.equal(await invitationHolding(resent.token), resent.inviteId);
  });

  it("copies a link under a newly minted token, which retires the emailed one", async () => {
    const emailed = await created();

    const { url } = await copyInviteLink(TENANT, emailed.inviteId);
    const copied = new URL(url, "http://dms.test").searchParams.get("token");

    assert.ok(copied);
    assert.notEqual(copied, emailed.token);
    assert.ok(await invitationHolding(copied));
    assert.equal(await invitationHolding(emailed.token), undefined);
  });
});
