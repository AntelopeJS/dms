import { strict as assert } from "node:assert";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserInviteModel } from "@antelopejs/interface-dms/db";
import { createUserInviteToken } from "@antelopejs/interface-dms/invites";
import { resetDatabase } from "../helpers/db";
import { holdFirstCall } from "../helpers/invite-holds";

const TENANT = "invite-replacement-race-tenant";
const OPTIONS = {
  tenantId: TENANT,
  email: "Replacement@Example.test",
  language: "en",
  roleIds: ["member"],
  asTenantOwner: false,
};

describe("[integration] finding F1 of formal-invite-creation (`NoCrash`): a second caller of the same content throws on a replacement the first has decided and not inserted (a fix turns this red: delete this test and the finding then)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("throws while the first caller has not inserted the replacement", async () => {
    await createUserInviteToken(OPTIONS);
    const hold = holdFirstCall("insert");
    const replacing = createUserInviteToken(OPTIONS);
    await hold.parked;
    try {
      await assert.rejects(
        createUserInviteToken(OPTIONS),
        /Invite replacement is indeterminate/,
        "F1 no longer reproduces: remove this test and the NoCrash finding of the check",
      );
    } finally {
      hold.release();
    }
    const kept = await replacing;
    const rows = await GetModel(UserInviteModel, TENANT).getAll();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?._id, kept.inviteId);
  });
});
