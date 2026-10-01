import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
import type { InviteExtensionPayloads } from "@antelopejs/interface-dms/invite-extensions";
import {
  type InviteEmailDelivery,
  type InviteUserToTenantOptions,
  inviteUserToTenant,
} from "@antelopejs/interface-dms/invites";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { Logging } from "@antelopejs/interface-core/logging";
import {
  type MemberInvitePayload,
  resolveInviteeNameParts,
  uniqueInviteEmails,
} from "../../../validation/member-invite.schema";

/** What happened to one address of an invite request. */
export type InviteOutcome = "invited" | "added" | "already_member" | "failed";

export interface InviteEmailResult {
  email: string;
  outcome: InviteOutcome;
  /** i18n key or message explaining a `failed` outcome. */
  message?: string;
  /** Whether the email of an `invited` address left. */
  emailDelivery?: InviteEmailDelivery;
}

/** Who sends the invitations and into which tenant. */
export interface InviteBatchSender {
  tenantId: string;
  userId: string;
  name: string;
}

const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_ERROR = 500;
const INVITE_FAILED_MESSAGE = "$page.settings.members.invite.failed";

function failureMessage(error: unknown): string {
  if (!(error instanceof HTTPResult)) return INVITE_FAILED_MESSAGE;
  if (error.getStatus() >= HTTP_INTERNAL_ERROR) return INVITE_FAILED_MESSAGE;
  const body: unknown = error.getBody();
  return typeof body === "string" && body ? body : INVITE_FAILED_MESSAGE;
}

async function isAlreadyMember(
  tenantId: string,
  email: string,
): Promise<boolean> {
  const existingUser = await GetModel(UserModel).getByEmail(email);
  if (!existingUser) return false;
  const member = await GetModel(TenantMemberModel, tenantId).getByUser(
    existingUser._id,
  );
  return !!member;
}

function buildInviteOptions(
  payload: MemberInvitePayload,
  sender: InviteBatchSender,
  extensions: InviteExtensionPayloads | undefined,
): Omit<InviteUserToTenantOptions, "email"> {
  const names =
    payload.emails.length === 1 ? resolveInviteeNameParts(payload) : {};
  return {
    tenantId: sender.tenantId,
    firstname: names.firstname,
    lastname: names.lastname,
    language: payload.language,
    roleIds: payload.roles ?? [],
    asTenantOwner: payload.asTenantOwner,
    skipEmailValidation: payload.skipEmailValidation,
    sendEmail: true,
    awaitEmailDelivery: true,
    inviterName: sender.name,
    invitedBy: sender.userId,
    extensions,
  };
}

async function inviteOne(
  email: string,
  options: Omit<InviteUserToTenantOptions, "email">,
): Promise<InviteEmailResult> {
  if (await isAlreadyMember(options.tenantId, email)) {
    return { email, outcome: "already_member" };
  }
  try {
    const result = await inviteUserToTenant({ ...options, email });
    if (result.kind === "added") return { email, outcome: result.kind };
    return { email, outcome: result.kind, emailDelivery: result.emailDelivery };
  } catch (error) {
    Logging.Warn(`[dms] invitation to "${email}" was refused:`, error);
    return { email, outcome: "failed", message: failureMessage(error) };
  }
}

/**
 * Invite every address of the request with the same roles, one after the
 * other: a module refusing one of them (a seat limit reached halfway, say)
 * must see the invitations already created before it.
 *
 * @returns One result per distinct address, in the order typed
 */
export async function inviteMembers(
  payload: MemberInvitePayload,
  sender: InviteBatchSender,
  extensions: InviteExtensionPayloads | undefined,
): Promise<InviteEmailResult[]> {
  const options = buildInviteOptions(payload, sender, extensions);
  const results: InviteEmailResult[] = [];
  for (const email of uniqueInviteEmails(payload.emails)) {
    results.push(await inviteOne(email, options));
  }
  return results;
}

const SUCCESSFUL_OUTCOMES = new Set<InviteOutcome>(["invited", "added"]);

/** Addresses of a batch that became a member or a pending invitation. */
export function countSuccessfulInvites(results: InviteEmailResult[]): number {
  return results.filter((result) => SUCCESSFUL_OUTCOMES.has(result.outcome))
    .length;
}

/** Whether an invitation of the batch was created without its email. */
export function hasUndeliveredInviteEmail(
  results: InviteEmailResult[],
): boolean {
  return results.some((result) => result.emailDelivery === "failed");
}

/** A toast the invite form shows next to its success one. */
export interface MemberInviteNotice {
  color: "warning";
  title: string;
  description: string;
  params: { sent: number; count: number };
}

/** The partial-success toast of a batch where some addresses were skipped. */
export function inviteNotice(
  results: InviteEmailResult[],
): MemberInviteNotice | undefined {
  const sent = countSuccessfulInvites(results);
  const skipped = results.length - sent;
  if (skipped === 0) return undefined;
  return {
    color: "warning",
    title: "$page.settings.members.invite.partial_title",
    description: "$page.settings.members.invite.partial_description",
    params: { sent, count: skipped },
  };
}

/**
 * The error a request answers with when none of its addresses went through:
 * the one of its first refused address, else "already a member".
 */
export function batchFailure(results: InviteEmailResult[]): HTTPResult {
  const failed = results.find((result) => result.outcome === "failed");
  if (failed?.message) return new HTTPResult(HTTP_CONFLICT, failed.message);
  return new HTTPResult(
    HTTP_CONFLICT,
    "$page.settings.members.invite.already_member",
  );
}
