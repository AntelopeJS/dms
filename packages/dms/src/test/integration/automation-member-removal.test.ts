import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserInviteModel } from "@antelopejs/interface-dms/db";
import { Hook } from "@antelopejs/interface-dms/hooks";
import {
  completeInviteResolution,
  decideInvite,
} from "@antelopejs/interface-dms/invite-resolution";
import { expect } from "chai";
import {
  CANCEL_INVITE_ACTION_ID,
  REMOVE_MEMBER_ACTION_ID,
} from "../../pages/members";
import { armTrigger, runAction } from "../helpers/automation-nodes";
import {
  addMember,
  HTTP_PAYMENT_REQUIRED,
  insertUser,
  type MemberTenants,
  OTHER_TENANT,
  pauseMemberChanges,
  seedMemberTenants,
  stepFailure,
  storedMember,
  TENANT,
  withHook,
} from "../helpers/member-action-fixtures";

const HOUR_MS = 3_600_000;
const INVITEE = "invitee@test.local";

describe("[integration] automation action dms.cancel-invite", () => {
  let inviteId: string;

  beforeEach(async () => {
    await seedMemberTenants();
    [inviteId] = await GetModel(UserInviteModel, TENANT).insert({
      email: INVITEE,
      roles_ids: [],
      language: "en",
      token: randomUUID(),
      asTenantOwner: false,
      expiresAt: new Date(Date.now() + HOUR_MS),
    });
  });

  it("cancels a pending invite, firing invite-resolved only to triggers including automation writes", async () => {
    const ignoring = await armTrigger("dms.invite-resolved");
    const including = await armTrigger("dms.invite-resolved", {
      includeAutomationWrites: true,
    });
    try {
      expect(
        await runAction(
          CANCEL_INVITE_ACTION_ID,
          { tenantId: TENANT, inviteId },
          { procedureId: "tidy-invites" },
        ),
      ).to.deep.equal({ cancelled: true, status: "cancelled", email: INVITEE });
    } finally {
      await ignoring.disarm();
      await including.disarm();
    }
    expect(await GetModel(UserInviteModel, TENANT).get(inviteId)).to.equal(
      undefined,
    );
    expect(ignoring.events).to.deep.equal([]);
    expect(including.events).to.have.length(1);
    expect(including.events[0]).to.deep.include({
      reason: "cancelled",
      originProcedureId: "tidy-invites",
    });
  });

  it("stays cancelled when repeated, and answers not-found for an unknown invite", async () => {
    await runAction(CANCEL_INVITE_ACTION_ID, { tenantId: TENANT, inviteId });
    expect(
      await runAction(CANCEL_INVITE_ACTION_ID, { tenantId: TENANT, inviteId }),
    ).to.deep.include({ cancelled: true, status: "cancelled" });
    expect(
      await runAction(CANCEL_INVITE_ACTION_ID, {
        tenantId: TENANT,
        inviteId: "no-such-invite",
      }),
    ).to.deep.equal({ cancelled: false, status: "not-found" });
    expect(
      await runAction(CANCEL_INVITE_ACTION_ID, {
        tenantId: OTHER_TENANT,
        inviteId,
      }),
    ).to.deep.equal({ cancelled: false, status: "not-found" });
  });

  it("answers already-resolved for an invite another decision ended", async () => {
    const invite = await GetModel(UserInviteModel, TENANT).get(inviteId);
    if (!invite) throw new Error("no invite");
    await completeInviteResolution(
      await decideInvite({ tenantId: TENANT, invite, reason: "expired" }),
    );
    expect(
      await runAction(CANCEL_INVITE_ACTION_ID, { tenantId: TENANT, inviteId }),
    ).to.deep.equal({
      cancelled: false,
      status: "already-resolved",
      reason: "expired",
      email: INVITEE,
    });
  });

  it("leaves the invite in a test run", async () => {
    expect(
      await runAction(
        CANCEL_INVITE_ACTION_ID,
        { tenantId: TENANT, inviteId },
        { dryRun: true },
      ),
    ).to.deep.include({ cancelled: true, status: "cancelled" });
    expect(await GetModel(UserInviteModel, TENANT).get(inviteId)).to.not.equal(
      undefined,
    );
  });
});

function removeMember(
  userId: string,
  options: { dryRun?: boolean; procedureId?: string } = {},
) {
  return runAction(
    REMOVE_MEMBER_ACTION_ID,
    { tenantId: TENANT, userId },
    options,
  );
}

describe("[integration] automation action dms.remove-member", () => {
  let tenants: MemberTenants;

  beforeEach(async () => {
    tenants = await seedMemberTenants();
  });

  it("removes a member while the seat hook still sees the row, firing member-removed only when included", async () => {
    const { member } = tenants;
    const rowsSeenByHook: boolean[] = [];
    const ignoring = await armTrigger("dms.member-removed");
    const including = await armTrigger("dms.member-removed", {
      includeAutomationWrites: true,
    });
    try {
      await withHook(
        Hook.MEMBER_REMOVED,
        async ({ tenantId, userIds }) => {
          for (const userId of userIds)
            rowsSeenByHook.push(Boolean(await storedMember(userId, tenantId)));
          return undefined;
        },
        async () => {
          expect(
            await removeMember(member, { procedureId: "offboard" }),
          ).to.deep.equal({
            removed: true,
            userId: member,
            wasTenantOwner: false,
          });
        },
      );
    } finally {
      await ignoring.disarm();
      await including.disarm();
    }
    expect(rowsSeenByHook).to.deep.equal([true]);
    expect(await storedMember(member)).to.equal(undefined);
    expect(await storedMember(member, OTHER_TENANT)).to.not.equal(undefined);
    expect(ignoring.events).to.deep.equal([]);
    expect(including.events).to.have.length(1);
    expect(including.events[0]).to.deep.include({
      tenantId: TENANT,
      userIds: [member],
      originProcedureId: "offboard",
    });
  });

  it("answers removed false for a user who is not a member", async () => {
    expect(await removeMember("stranger")).to.deep.equal({
      removed: false,
      userId: "stranger",
      wasTenantOwner: false,
    });
  });

  it("refuses to remove the last owner, in a real run and a test run", async () => {
    for (const dryRun of [false, true])
      await stepFailure(removeMember(tenants.owner, { dryRun }));
    expect(await storedMember(tenants.owner)).to.not.equal(undefined);
  });

  it("refuses a workspace whose member changes are paused, in a real run and a test run", async () => {
    await pauseMemberChanges();
    expect(await stepFailure(removeMember(tenants.member))).to.contain(
      "admission is paused",
    );
    expect(
      await stepFailure(removeMember(tenants.member, { dryRun: true })),
    ).to.contain("are paused");
    expect(await storedMember(tenants.member)).to.not.equal(undefined);
  });

  it("refuses to remove the last platform owner outside SaaS mode", async () => {
    const platformOwner = await insertUser("platform@test.local", true);
    await addMember(TENANT, platformOwner, [], true);
    expect(await stepFailure(removeMember(platformOwner))).to.contain(
      "without an owner",
    );
    expect(await storedMember(platformOwner)).to.not.equal(undefined);
  });

  it("keeps the row when a veto refuses, and in a test run, which fires nothing", async () => {
    const { member } = tenants;
    await withHook(
      Hook.MEMBER_BEING_CHANGED,
      () => {
        throw new HTTPResult(HTTP_PAYMENT_REQUIRED, "no removals");
      },
      async () => {
        expect(await stepFailure(removeMember(member))).to.contain(
          "no removals",
        );
      },
    );
    const including = await armTrigger("dms.member-removed", {
      includeAutomationWrites: true,
    });
    try {
      expect(await removeMember(member, { dryRun: true })).to.deep.equal({
        removed: true,
        userId: member,
        wasTenantOwner: false,
      });
    } finally {
      await including.disarm();
    }
    expect(including.events).to.deep.equal([]);
    expect(await storedMember(member)).to.not.equal(undefined);
  });
});
