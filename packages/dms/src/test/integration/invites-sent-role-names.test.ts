import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  RoleModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db/models";
import { expect } from "chai";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import { authorizedClient, registerUser } from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { findUserByEmail } from "../helpers/fixtures";

const HOUR_MS = 3_600_000;
const HTTP_OK = 200;
const EXPORT = `${pageRoutePath("/settings/user/profile")}/account-export`;

describe("[integration] account export — roles of the invitations a user sent", () => {
  beforeEach(resetDatabase);

  it("names each invitation's roles, as one role query per invitation did (order aside)", async () => {
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

    const response = await authorizedClient(owner.accessToken).get<{
      invitesSent: { email: string; roles: string[] }[];
    }>(EXPORT);
    expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    const file = response.data;

    const byEmail = new Map(
      file.invitesSent.map((invite) => [invite.email, invite.roles]),
    );
    expect(byEmail.size).to.equal(sent.length);
    for (const [index, ids] of sent.entries()) {
      const expected =
        ids.length === 0
          ? []
          : (await roles.getBy("_id", ...ids)).map((role) => role.name);
      expect(byEmail.get(`sent-${index}@test.local`)).to.have.members(expected);
    }
    expect(byEmail.get("sent-0@test.local")).to.deep.equal(["Editors"]);
    expect(byEmail.get("sent-2@test.local")).to.deep.equal([]);
  });
});
