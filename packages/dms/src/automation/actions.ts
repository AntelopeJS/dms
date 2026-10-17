import { GetModel } from "@antelopejs/interface-database-decorators";
import { Send } from "@antelopejs/interface-email";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import {
  GenerateHtml,
  GetHtmlTemplate,
} from "@antelopejs/interface-dms/html-render";
import {
  type InviteUserToTenantOptions,
  inviteUserToTenant,
} from "@antelopejs/interface-dms/invites";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import type { ActionType } from "@antelopejs/interface-dms-automation";
import { sendNotificationAction } from "./send-notification";

export const SEND_EMAIL_ACTION_ID = "dms.send-email";

interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  template?: string;
  props?: Record<string, unknown>;
  language?: string;
}

interface SendEmailOutput {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** A user's language when the address belongs to one, for a rendered template. */
async function recipientLanguage(email: string): Promise<string | undefined> {
  const user = await GetModel(UserModel).getByEmail(email);
  return user?.language || undefined;
}

/**
 * The body to send: a registered template rendered in the given language (or
 * the recipient's), else the literal HTML. A template name that no module
 * registered fails the run rather than sending a blank email.
 */
async function emailBody(input: SendEmailInput): Promise<string> {
  const template = input.template?.trim();
  if (!template) {
    if (typeof input.html === "string") return input.html;
    throw new Error(`${SEND_EMAIL_ACTION_ID} requires html or a template`);
  }
  if (!(await GetHtmlTemplate(template))) {
    throw new Error(
      `${SEND_EMAIL_ACTION_ID}: no HTML template is registered as "${template}"`,
    );
  }
  const language =
    input.language?.trim() || (await recipientLanguage(input.to));
  return GenerateHtml({ name: template }, input.props ?? {}, language);
}

const sendEmailAction: ActionType<SendEmailInput, SendEmailOutput> = {
  id: SEND_EMAIL_ACTION_ID,
  name: "Send email",
  description:
    "Send an HTML email through the configured email provider, written out or rendered from a registered HTML template",
  icon: "i-ph-envelope-simple",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string" },
      subject: { type: "string" },
      html: { type: "string" },
      template: {
        type: "string",
        description:
          "Name of a registered HTML template to render instead of html",
      },
      props: {
        type: "object",
        description: "Props the template is rendered with",
      },
      language: {
        type: "string",
        description:
          "Language the template is rendered in; defaults to the recipient's when the address belongs to a user",
      },
    },
    required: ["to", "subject"],
    anyOf: [{ required: ["html"] }, { required: ["template"] }],
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
      html: await emailBody(input),
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

export const INVITE_USER_ACTION_ID = "dms.invite-user";

interface InviteUserInput {
  email: string;
  tenantId?: string;
  roleIds?: string[];
  asTenantOwner?: boolean;
  sendEmail?: boolean;
  language?: string;
  firstname?: string;
  lastname?: string;
  inviterName?: string;
}

interface InviteUserOutput {
  kind: "added" | "invited" | "already-member";
  userId?: string;
  inviteId?: string;
}

type InvitationDetails = Pick<
  InviteUserToTenantOptions,
  "language" | "firstname" | "lastname" | "inviterName"
>;

// Each detail is passed only when given, so an empty port keeps the defaults
// of inviteUserToTenant (an English invitation, without names).
function invitationDetails(input: InviteUserInput): InvitationDetails {
  const details: InvitationDetails = {};
  const language = input.language?.trim();
  const firstname = input.firstname?.trim();
  const lastname = input.lastname?.trim();
  const inviterName = input.inviterName?.trim();
  if (language) details.language = language;
  if (firstname) details.firstname = firstname;
  if (lastname) details.lastname = lastname;
  if (inviterName) details.inviterName = inviterName;
  return details;
}

const inviteUserAction: ActionType<InviteUserInput, InviteUserOutput> = {
  id: INVITE_USER_ACTION_ID,
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
      language: {
        type: "string",
        description:
          "Language of the invitation email and of the account it creates; defaults to en",
      },
      firstname: { type: "string" },
      lastname: { type: "string" },
      inviterName: {
        type: "string",
        description: "Who the invitation email says it comes from",
      },
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
      ...invitationDetails(input),
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
