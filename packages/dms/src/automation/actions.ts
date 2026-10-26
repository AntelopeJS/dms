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
import { fieldHint, nodeText, titledProperties } from "./i18n";
import { sendNotificationAction } from "./send-notification";

export const SEND_EMAIL_ACTION_ID = "dms.send-email";
const SEND_EMAIL_TEXTS = "actions.sendEmail";

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
 * The registered template an email renders, or `undefined` for literal HTML.
 * A template name that no module registered fails the run rather than sending
 * a blank email; a test run checks the same.
 */
async function bodyTemplate(
  input: SendEmailInput,
): Promise<string | undefined> {
  const template = input.template?.trim();
  if (!template) {
    if (typeof input.html === "string") return undefined;
    throw new Error(`${SEND_EMAIL_ACTION_ID} requires html or a template`);
  }
  if (!(await GetHtmlTemplate(template))) {
    throw new Error(
      `${SEND_EMAIL_ACTION_ID}: no HTML template is registered as "${template}"`,
    );
  }
  return template;
}

/**
 * The body to send: a registered template rendered in the given language (or
 * the recipient's), else the literal HTML.
 */
async function emailBody(input: SendEmailInput): Promise<string> {
  const template = await bodyTemplate(input);
  if (!template) return input.html ?? "";
  const language =
    input.language?.trim() || (await recipientLanguage(input.to));
  return GenerateHtml({ name: template }, input.props ?? {}, language);
}

const sendEmailAction: ActionType<SendEmailInput, SendEmailOutput> = {
  id: SEND_EMAIL_ACTION_ID,
  name: nodeText(SEND_EMAIL_TEXTS, "name"),
  description: nodeText(SEND_EMAIL_TEXTS, "description"),
  icon: "i-ph-envelope-simple",
  inputSchema: {
    type: "object",
    properties: titledProperties({
      to: { type: "string" },
      subject: { type: "string" },
      html: { type: "string" },
      template: {
        type: "string",
        description: fieldHint(SEND_EMAIL_TEXTS, "template"),
      },
      props: {
        type: "object",
        description: fieldHint(SEND_EMAIL_TEXTS, "props"),
      },
      language: {
        type: "string",
        description: fieldHint(SEND_EMAIL_TEXTS, "language"),
      },
    }),
    required: ["to", "subject"],
    anyOf: [{ required: ["html"] }, { required: ["template"] }],
  },
  outputSchema: {
    type: "object",
    properties: titledProperties({
      success: { type: "boolean" },
      messageId: { type: "string" },
      error: { type: "string" },
    }),
  },

  async dryRun(input, ctx) {
    await bodyTemplate(input);
    ctx.log("info", `test run: email to "${input.to}" not sent`);
    return { success: true };
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
const INVITE_USER_TEXTS = "actions.inviteUser";

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

interface ExistingMembership {
  userId?: string;
  member: boolean;
}

/** The user an address belongs to, and whether they already are a member. */
async function existingMembership(
  email: string,
  tenantId: string,
): Promise<ExistingMembership> {
  const user = await GetModel(UserModel).getByEmail(email);
  if (!user) return { member: false };
  const member = await GetModel(TenantMemberModel, tenantId).getByUser(
    user._id,
  );
  return { userId: user._id, member: Boolean(member) };
}

const inviteUserAction: ActionType<InviteUserInput, InviteUserOutput> = {
  id: INVITE_USER_ACTION_ID,
  name: nodeText(INVITE_USER_TEXTS, "name"),
  description: nodeText(INVITE_USER_TEXTS, "description"),
  icon: "i-ph-user-plus",
  inputSchema: {
    type: "object",
    properties: titledProperties({
      email: { type: "string" },
      tenantId: {
        type: "string",
        description: fieldHint(INVITE_USER_TEXTS, "tenantId"),
      },
      roleIds: { type: "array", items: { type: "string" } },
      asTenantOwner: { type: "boolean", default: false },
      sendEmail: { type: "boolean", default: true },
      language: {
        type: "string",
        description: fieldHint(INVITE_USER_TEXTS, "language"),
      },
      firstname: { type: "string" },
      lastname: { type: "string" },
      inviterName: {
        type: "string",
        description: fieldHint(INVITE_USER_TEXTS, "inviterName"),
      },
    }),
    required: ["email"],
  },
  outputSchema: {
    type: "object",
    properties: titledProperties({
      kind: { type: "string", enum: ["added", "invited", "already-member"] },
      userId: { type: "string" },
      inviteId: { type: "string" },
    }),
  },

  async dryRun(input, ctx) {
    const tenantId = input.tenantId?.trim() || DEFAULT_TENANT_ID;
    const existing = await existingMembership(input.email, tenantId);
    if (existing.member) {
      return { kind: "already-member", userId: existing.userId };
    }
    ctx.log(
      "info",
      `test run: "${input.email}" not invited to tenant "${tenantId}"`,
    );
    if (existing.userId) return { kind: "added", userId: existing.userId };
    return { kind: "invited" };
  },
  async execute(input, ctx) {
    const tenantId = input.tenantId?.trim() || DEFAULT_TENANT_ID;

    const existing = await existingMembership(input.email, tenantId);
    if (existing.member) {
      ctx.log(
        "warn",
        `"${input.email}" is already a member of tenant "${tenantId}"; membership left unchanged`,
      );
      return { kind: "already-member", userId: existing.userId };
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
