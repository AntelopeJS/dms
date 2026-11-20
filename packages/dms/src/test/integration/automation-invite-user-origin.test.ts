import { inviteUserToTenant } from "@antelopejs/interface-dms/invites";
import { expect } from "chai";
import { INVITE_USER_ACTION_ID } from "../../automation";
import { armTrigger, runAction } from "../helpers/automation-nodes";
import {
  insertUser,
  seedMemberTenants,
  TENANT,
} from "../helpers/member-action-fixtures";

async function armBoth(event: string) {
  return {
    ignoring: await armTrigger(event),
    including: await armTrigger(event, { includeAutomationWrites: true }),
  };
}

describe("[integration] automation action dms.invite-user, procedure-made events", () => {
  beforeEach(seedMemberTenants);

  it("fires member-added for an existing user only to triggers including automation writes", async () => {
    const joiner = await insertUser("joiner@test.local");
    const { ignoring, including } = await armBoth("dms.member-added");
    try {
      expect(
        await runAction(
          INVITE_USER_ACTION_ID,
          { email: "joiner@test.local", tenantId: TENANT, sendEmail: false },
          { procedureId: "onboard" },
        ),
      ).to.deep.include({ kind: "added", userId: joiner });
    } finally {
      await ignoring.disarm();
      await including.disarm();
    }
    expect(ignoring.events).to.deep.equal([]);
    expect(including.events).to.have.length(1);
    expect(including.events[0]).to.deep.include({
      tenantId: TENANT,
      userId: joiner,
      originProcedureId: "onboard",
      originRunId: "onboard-run",
    });
  });

  it("fires invite-created for a new address only to triggers including automation writes", async () => {
    const { ignoring, including } = await armBoth("dms.invite-created");
    try {
      await runAction(
        INVITE_USER_ACTION_ID,
        { email: "newcomer@test.local", tenantId: TENANT, sendEmail: false },
        { procedureId: "onboard" },
      );
    } finally {
      await ignoring.disarm();
      await including.disarm();
    }
    expect(ignoring.events).to.deep.equal([]);
    expect(including.events).to.have.length(1);
    expect(including.events[0]).to.deep.include({
      email: "newcomer@test.local",
      originProcedureId: "onboard",
    });
  });

  it("still fires by default for an invitation no procedure made", async () => {
    const { ignoring, including } = await armBoth("dms.invite-created");
    try {
      await inviteUserToTenant({
        tenantId: TENANT,
        email: "by-hand@test.local",
        roleIds: [],
        asTenantOwner: false,
        sendEmail: false,
      });
    } finally {
      await ignoring.disarm();
      await including.disarm();
    }
    expect(ignoring.events).to.have.length(1);
    expect(including.events).to.have.length(1);
    expect(ignoring.events[0]).to.not.have.property("originProcedureId");
  });
});
