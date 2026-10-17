import { GetModel } from "@antelopejs/interface-database-decorators";
import { Send } from "@antelopejs/interface-email";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import { inviteUserToTenant } from "@antelopejs/interface-dms/invites";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import type { ActionType } from "@antelopejs/interface-dms-automation";
import { sendNotificationAction } from "./send-notification";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

interface SendEmailOutput {
  success: boolean;
  messageId?: string;
  error?: string;
}

const sendEmailAction: ActionType<SendEmailInput, SendEmailOutput> = {
  id: "dms.send-email",
  name: "Send email",
  description: "Send an HTML email through the configured email provider",
  icon: "i-ph-envelope-simple",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string" },
      subject: { type: "string" },
      html: { type: "string" },
    },
    required: ["to", "subject", "html"],
  },
  outputSchema: {
    type: "object",
    properties: {
      success: { type: "boolean" },
      messageId: { type: "string" },
      error: { type: "string" },
    },
  },
  async execute(input, ctx) {
    const result = await Send({
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (!result.success) {
      ctx.log("error", `email to "${input.to}" failed`, result.error?.message);
    }
    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error?.message,
    };
  },
};

interface InviteUserInput {
  email: string;
  tenantId?: string;
  roleIds?: string[];
  asTenantOwner?: boolean;
  sendEmail?: boolean;
}

interface InviteUserOutput {
  kind: "added" | "invited" | "already-member";
  userId?: string;
  inviteId?: string;
}

const inviteUserAction: ActionType<InviteUserInput, InviteUserOutput> = {
  id: "dms.invite-user",
  name: "Invite user",
  description:
    "Invite an email address to a tenant: existing users are added as members directly, otherwise an invite is created (and its signup email sent unless sendEmail is false)",
  icon: "i-ph-user-plus",
  inputSchema: {
    type: "object",
    properties: {
      email: { type: "string" },
      tenantId: {
        type: "string",
        description: "Tenant to invite into; defaults to the default tenant",
      },
      roleIds: { type: "array", items: { type: "string" } },
      asTenantOwner: { type: "boolean", default: false },
      sendEmail: { type: "boolean", default: true },
    },
    required: ["email"],
  },
  outputSchema: {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["added", "invited", "already-member"] },
      userId: { type: "string" },
      inviteId: { type: "string" },
    },
  },
  async execute(input, ctx) {
    const tenantId = input.tenantId?.trim() || DEFAULT_TENANT_ID;
    // Same pre-check as the members invite route: never let a duplicate
    // invite silently overwrite an existing member's roles or ownership.
    const existingUser = await GetModel(UserModel).getByEmail(input.email);
    if (existingUser) {
      const member = await GetModel(TenantMemberModel, tenantId).getByUser(
        existingUser._id,
      );
      if (member) {
        ctx.log(
          "warn",
          `"${input.email}" is already a member of tenant "${tenantId}"; membership left unchanged`,
        );
        return { kind: "already-member", userId: existingUser._id };
      }
    }
    const result = await inviteUserToTenant({
      tenantId,
      email: input.email,
      roleIds: input.roleIds ?? [],
      asTenantOwner: input.asTenantOwner ?? false,
      sendEmail: input.sendEmail ?? true,
    });
    if (result.kind === "added") {
      ctx.log(
        "info",
        `existing user added to tenant "${tenantId}"`,
        result.userId,
      );
      return { kind: "added", userId: result.userId };
    }
    ctx.log(
      "info",
      `invite created for "${input.email}" on tenant "${tenantId}"`,
      result.inviteId,
    );
    return { kind: "invited", inviteId: result.inviteId };
  },
};

export const ACTIONS: ActionType[] = [
  sendEmailAction,
  sendNotificationAction,
  inviteUserAction,
];
