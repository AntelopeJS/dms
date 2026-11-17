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
const INVITE_COUNT = 60;
const MAX_ROLES_PER_INVITE = 6;
const EXPORT = `${pageRoutePath("/settings/user/profile")}/account-export`;

describe("[integration] account export — roles of the invitations a user sent", () => {
  beforeEach(resetDatabase);

  it("names each invitation's roles exactly as one role query per invitation did", async () => {
    const owner = await registerUser({ owner: true });
    const roles = GetModel(RoleModel, DEFAULT_TENANT_ID);
    const roleIds = await roles.insert(
      ["Zeta", "Mid", "Alpha", "Omega", "Beta", "Unused"].map((name) => ({
        name,
        permissions: [],
      })),
    );
    const ownerRow = await findUserByEmail(owner.email);
    const invites = GetModel(UserInviteModel, DEFAULT_TENANT_ID);
    const pool = [...roleIds.slice(0, 5), "deleted-role"];
    const sent = Array.from({ length: INVITE_COUNT }, (_, index) =>
      Array.from(
        { length: index % MAX_ROLES_PER_INVITE },
        (_unused, slot) =>
          pool[(index * 7 + slot * slot * 3 + slot) % pool.length],
      ),
    );
    expect(sent.some((ids) => new Set(ids).size < ids.length)).to.equal(true);
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
      roles_ids: [roleIds[5]],
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

    const byEmail = new Map(
      response.data.invitesSent.map((invite) => [invite.email, invite.roles]),
    );
    expect(byEmail.size).to.equal(INVITE_COUNT);
    for (const [index, ids] of sent.entries()) {
      const before =
        ids.length === 0
          ? []
          : (await roles.getBy("_id", ...ids)).map((role) => role.name);
      expect(byEmail.get(`sent-${index}@test.local`)).to.deep.equal(before);
    }
  });
});
