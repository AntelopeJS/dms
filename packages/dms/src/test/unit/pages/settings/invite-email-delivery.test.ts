import { ImplementInterface } from "@antelopejs/interface-core";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { ExecutionCtx } from "@antelopejs/interface-dms-automation";
import { expect } from "chai";
import { sendAdminInviteEmail } from "@antelopejs/interface-dms/auth";
import { TenantModel, UserInviteModel } from "@antelopejs/interface-dms/db";
import { inviteUserToTenant } from "@antelopejs/interface-dms/invites";
import { ACTIONS } from "../../../../automation/actions";
import {
  INVITE_RESEND_EMAIL_FAILED_WARNING,
  resendPendingInvite,
} from "../../../../pages/settings/users/invites";
import {
  INVITE_EMAIL_FAILED_WARNING,
  INVITES_PAGE_PATH,
  memberInviteResponse,
} from "../../../../pages/settings/users/members";
import { resetDatabase } from "../../../helpers/db";

const WORKSPACE_ID = "invite-email-delivery-workspace";
const INVITEE_EMAIL = "invitee@delivery.test";
const SMTP_REFUSAL = "525 5.7.1 Unauthorized IP address";

type EmailSender = () => Promise<void>;

const refuse: EmailSender = async () => {
  throw new Error(`Failed to send email: ${SMTP_REFUSAL}`);
};
const accept: EmailSender = async () => undefined;

const automationCtx: ExecutionCtx = {
  procedureId: "procedure",
  runId: "run",
  nodeId: "node",
  log: () => undefined,
};

function inviteThroughMembersRoute() {
  return inviteUserToTenant({
    tenantId: WORKSPACE_ID,
    email: INVITEE_EMAIL,
    roleIds: [],
    sendEmail: true,
    awaitEmailDelivery: true,
  });
}

async function createPendingInviteId(): Promise<string> {
  const result = await inviteUserToTenant({
    tenantId: WORKSPACE_ID,
    email: INVITEE_EMAIL,
  });
  if (result.kind !== "invited") throw new Error("Expected a pending invite");
  return result.inviteId;
}

function pendingInvite() {
  return GetModel(UserInviteModel, WORKSPACE_ID).getByEmail(INVITEE_EMAIL);
}

describe("[unit] pages/settings — invitation email delivery", () => {
  let sendEmail: EmailSender;
  let sentCount: number;

  before(() => {
    ImplementInterface(
      { sendAdminInviteEmail },
      {
        sendAdminInviteEmail: () => {
          sentCount += 1;
          return sendEmail();
        },
      },
    );
  });

  beforeEach(async () => {
    await resetDatabase();
    sendEmail = accept;
    sentCount = 0;
    const now = new Date();
    await GetModel(TenantModel).insert({
      _id: WORKSPACE_ID,
      name: "Delivery",
      createdAt: now,
      updatedAt: now,
    });
  });

  describe("members invite route", () => {
    it("keeps the invitation and tells the inviter when the email fails", async () => {
      sendEmail = refuse;

      const result = await inviteThroughMembersRoute();

      expect(result).to.include({ kind: "invited", emailDelivery: "failed" });
      expect(await pendingInvite()).to.exist;
      const response = memberInviteResponse(result);
      expect(response).to.deep.equal({
        redirectPath: INVITES_PAGE_PATH,
        emailDelivery: "failed",
        warning: INVITE_EMAIL_FAILED_WARNING,
      });
      expect(JSON.stringify(response)).not.to.contain(SMTP_REFUSAL);
    });

    it("reports a sent email without a warning", async () => {
      const result = await inviteThroughMembersRoute();

      expect(sentCount).to.equal(1);
      expect(memberInviteResponse(result)).to.deep.equal({
        redirectPath: INVITES_PAGE_PATH,
        emailDelivery: "sent",
      });
    });
  });

  describe("resend", () => {
    it("keeps the reissued invitation and warns when the email fails", async () => {
      const inviteId = await createPendingInviteId();
      sendEmail = refuse;

      const outcome = await resendPendingInvite(WORKSPACE_ID, inviteId);

      expect(outcome).to.deep.equal({
        emailDelivery: "failed",
        warning: INVITE_RESEND_EMAIL_FAILED_WARNING,
      });
      expect(await pendingInvite()).to.exist;
    });

    it("reports a sent email without a warning", async () => {
      const inviteId = await createPendingInviteId();

      const outcome = await resendPendingInvite(WORKSPACE_ID, inviteId);

      expect(outcome).to.deep.equal({ emailDelivery: "sent" });
      expect(sentCount).to.equal(1);
    });
  });

  describe("callers that do not opt in", () => {
    // Awaiting the email here would never settle: it is held until after.
    it("still send in the background and report no delivery", async () => {
      let releaseEmail: () => void = () => undefined;
      const emailRequested = new Promise<void>((requested) => {
        sendEmail = () => {
          requested();
          return new Promise<void>((resolve) => {
            releaseEmail = resolve;
          });
        };
      });

      const result = await inviteUserToTenant({
        tenantId: WORKSPACE_ID,
        email: INVITEE_EMAIL,
        sendEmail: true,
      });
      await emailRequested;
      releaseEmail();

      expect(result).to.have.property("kind", "invited");
      expect(result).not.to.have.property("emailDelivery");
    });

    it("leave the automation invite action's output unchanged", async () => {
      sendEmail = refuse;
      const action = ACTIONS.find(({ id }) => id === "dms.invite-user");

      const output = await action?.execute(
        { email: INVITEE_EMAIL, tenantId: WORKSPACE_ID },
        automationCtx,
      );

      const invite = await pendingInvite();
      expect(output).to.deep.equal({ kind: "invited", inviteId: invite?._id });
    });
  });
});
