import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  RoleModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db/models";
import { expect } from "chai";
import {
  loadAccountExport,
  roleNamesOf,
} from "../../pages/settings/users/account-data-store";
import { registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { findUserByEmail } from "../helpers/fixtures";

const HOUR_MS = 3_600_000;

describe("[integration] account export — roles of the invitations a user sent", () => {
  beforeEach(resetDatabase);

  it("names each invitation's roles as one role query per invitation did", async () => {
    const owner = await registerUser({ owner: true });
    const roles = GetModel(RoleModel, DEFAULT_TENANT_ID);
    const [editors, readers, unused] = await roles.insert([
      { name: "Editors", permissions: [] },
      { name: "Readers", permissions: [] },
      { name: "Unused", permissions: [] },
    ]);
    const ownerRow = await findUserByEmail(owner.email);
    const invites = GetModel(UserInviteModel, DEFAULT_TENANT_ID);
    const sent = [[editors], [readers, editors], [], [editors, "deleted-role"]];
    await invites.insert(
      sent.map((roles_ids, index) => ({
        email: `sent-${index}@test.local`,
        roles_ids,
        language: "en",
        token: `sent-token-${index}`,
        asTenantOwner: false,
        invitedBy: ownerRow._id,
        expiresAt: new Date(Date.now() + HOUR_MS),
      })),
    );
    await invites.insert({
      email: "other@test.local",
      roles_ids: [unused],
      language: "en",
      token: "other-token",
      asTenantOwner: false,
      invitedBy: "someone-else",
      expiresAt: new Date(Date.now() + HOUR_MS),
    });

    const file = await loadAccountExport(ownerRow);

    const byEmail = new Map(
      file.invitesSent.map((invite) => [invite.email, invite.roles]),
    );
    expect(byEmail.size).to.equal(sent.length);
    for (const [index, ids] of sent.entries()) {
      expect(byEmail.get(`sent-${index}@test.local`)).to.deep.equal(
        await roleNamesOf(DEFAULT_TENANT_ID, ids),
      );
    }
    expect(byEmail.get("sent-0@test.local")).to.deep.equal(["Editors"]);
    expect(byEmail.get("sent-2@test.local")).to.deep.equal([]);
  });
});
