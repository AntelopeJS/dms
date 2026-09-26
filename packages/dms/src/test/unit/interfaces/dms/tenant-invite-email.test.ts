import { ImplementInterface } from "@antelopejs/interface-core";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import {
  type AdminInviteEmailContext,
  sendAdminInviteEmail,
} from "@antelopejs/interface-dms/auth";
import { TenantModel } from "@antelopejs/interface-dms/db";
import { internal } from "@antelopejs/interface-dms/invites";

const WORKSPACE_ID = "tenant-invite-email-workspace";
const WORKSPACE_NAME = "Storefront";
const INVITEE_EMAIL = "invitee@acme.dev";
const TOKEN = "tenant-invite-email-token";

interface SentInviteEmail {
  email: string;
  token: string;
  inviteeName?: string;
  context?: AdminInviteEmailContext;
}

describe("[unit] interfaces/dms — tenant invitation emails", () => {
  const sent: SentInviteEmail[] = [];

  before(async () => {
    ImplementInterface(
      { sendAdminInviteEmail },
      {
        sendAdminInviteEmail: async (email, token, inviteeName, context) => {
          sent.push({ email, token, inviteeName, context });
        },
      },
    );
    const now = new Date();
    await GetModel(TenantModel).insert({
      _id: WORKSPACE_ID,
      name: WORKSPACE_NAME,
      createdAt: now,
      updatedAt: now,
    });
  });

  beforeEach(() => {
    sent.length = 0;
  });

  it("names the workspace and the inviter, in the invitation's language", async () => {
    await internal.sendTenantInviteEmail({
      tenantId: WORKSPACE_ID,
      email: INVITEE_EMAIL,
      token: TOKEN,
      firstname: "Ada",
      lastname: "Lovelace",
      language: "fr",
      inviterName: "Grace Hopper",
    });

    expect(sent).to.have.length(1);
    expect(sent[0].email).to.equal(INVITEE_EMAIL);
    expect(sent[0].token).to.equal(TOKEN);
    expect(sent[0].inviteeName).to.equal("Ada Lovelace");
    expect(sent[0].context).to.deep.equal({
      workspaceName: WORKSPACE_NAME,
      inviterName: "Grace Hopper",
      language: "fr",
    });
  });
});
