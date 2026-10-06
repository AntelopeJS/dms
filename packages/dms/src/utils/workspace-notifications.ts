import { Logging } from "@antelopejs/interface-core/logging";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  type InviteResolution,
  InviteResolutionsModel,
  RoleModel,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import {
  AccountSubject,
  CollaborationSubject,
} from "@antelopejs/interface-dms/notifications";
import type { NotificationTone } from "@antelopejs/interface-dms/notifications/types";
import { UserNotificationsModel } from "../db/models/userNotifications.model";
import {
  emitNotification,
  emitNotificationToEach,
  NOTIFICATION_LINKS,
  type NotificationTemplate,
} from "./notification-emitter";
import {
  isWithinEditingSession,
  ownersToNotifyOfJoin,
  recipientsExcept,
} from "./notification-rules";
import { rolesChangedTone } from "./notification-tones";

const MESSAGES_PREFIX = "$dms.notifications.messages";

/** What a workspace template sets besides its message, icon and link. */
interface TemplateOptions {
  subject?: NotificationTemplate["subject"];
  tone?: NotificationTone;
}
const ROLE_NAME_SEPARATOR = ", ";
/** How far back an editing session's row is looked for; sessions slide, but not for days. */
const EDITING_SESSION_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function workspaceTemplate(
  messageId: string,
  icon: string,
  linkTo: string,
  { subject = CollaborationSubject, tone = "neutral" }: TemplateOptions = {},
): NotificationTemplate {
  return { icon, subject, messageId, linkTo, tone };
}

const templates = {
  collaboratorJoined: workspaceTemplate(
    "collaborator_joined",
    "i-ph-user-plus",
    NOTIFICATION_LINKS.members,
  ),
  inviteAccepted: workspaceTemplate(
    "invite_accepted",
    "i-ph-user-check",
    NOTIFICATION_LINKS.members,
    { tone: "success" },
  ),
  inviteExpired: workspaceTemplate(
    "invite_expired",
    "i-ph-clock-countdown",
    NOTIFICATION_LINKS.invites,
    { tone: "primary" },
  ),
  memberRemoved: workspaceTemplate(
    "member_removed",
    "i-ph-user-minus",
    NOTIFICATION_LINKS.members,
  ),
  rolePermissionsChanged: workspaceTemplate(
    "role_permissions_changed",
    "i-ph-key",
    NOTIFICATION_LINKS.roles,
    { tone: "primary" },
  ),
  rolesChanged: workspaceTemplate(
    "roles_changed",
    "i-ph-identification-badge",
    NOTIFICATION_LINKS.settings,
    { subject: AccountSubject },
  ),
  ownershipGranted: workspaceTemplate(
    "ownership_granted",
    "i-ph-crown",
    NOTIFICATION_LINKS.members,
    { subject: AccountSubject },
  ),
  ownershipRemoved: workspaceTemplate(
    "ownership_removed",
    "i-ph-crown-simple",
    NOTIFICATION_LINKS.settings,
    { subject: AccountSubject, tone: "warning" },
  ),
} satisfies Record<string, NotificationTemplate>;

/** Who did something, as the notifications about it name them. */
export interface NotificationActor {
  id: string;
  name: string;
}

async function tenantOwnerIds(tenantId: string): Promise<string[]> {
  const owners = await GetModel(TenantMemberModel, tenantId).listOwners();
  return owners.map((owner) => owner.userId);
}

/**
 * The inviter to tell about an invitation's outcome: set, not the invitee,
 * and still a member of the workspace the invitation was for.
 */
async function resolveInviterToNotify(
  resolution: InviteResolution,
): Promise<string | undefined> {
  const inviterId = resolution.invite.invitedBy;
  if (!inviterId || inviterId === resolution.userId) return undefined;
  const isMember = await GetModel(
    TenantMemberModel,
    resolution.tenantId,
  ).existsByUser(inviterId);
  return isMember ? inviterId : undefined;
}

/** The inviters told through "your invitation was accepted" that this user joined. */
async function findNotifiedInviters(userId: string): Promise<string[]> {
  const memberships = await GetModel(
    TenantMemberModel,
    CROSS_INSTANCE,
  ).listByUserWithTenantIds(userId);
  const inviters = await Promise.all(
    memberships.map(async ({ tenantId, member }) => {
      if (!member.inviteDeliveryId) return undefined;
      const resolution = await GetModel(InviteResolutionsModel, tenantId).get(
        member.inviteDeliveryId,
      );
      return resolution ? resolveInviterToNotify(resolution) : undefined;
    }),
  );
  return inviters.filter((id): id is string => id !== undefined);
}

async function ownersToTellOfJoin(
  ownerIds: string[],
  email: string,
): Promise<string[]> {
  try {
    const joined = await GetModel(UserModel).getByEmail(email.toLowerCase());
    if (!joined) return ownerIds;
    const inviters = await findNotifiedInviters(joined._id);
    return ownersToNotifyOfJoin(ownerIds, inviters, joined._id);
  } catch (error) {
    Logging.Error(
      `[DMS] Could not tell the inviter of "${email}" apart from the owners: ${String(error)}`,
    );
    return ownerIds;
  }
}

/** Tells the owners someone joined, except the inviter, who hears it from {@link notifyInviteOutcome}. */
export async function notifyCollaboratorJoined(
  ownerIds: string[],
  name: string,
  email: string,
): Promise<void> {
  const recipients = await ownersToTellOfJoin(ownerIds, email);
  await emitNotificationToEach(recipients, templates.collaboratorJoined, {
    params: { name: name || email, email },
  });
}

function inviteeName(
  resolution: InviteResolution,
  joinedName?: string,
): string {
  const { firstname, lastname, email } = resolution.invite;
  const invitedAs = [firstname, lastname].filter(Boolean).join(" ");
  return joinedName || invitedAs || email;
}

async function notifyInviteAccepted(
  inviterId: string,
  resolution: InviteResolution,
  idempotencyKey: string,
): Promise<void> {
  const joined = resolution.userId
    ? await GetModel(UserModel).get(resolution.userId)
    : undefined;
  const email = joined?.email ?? resolution.invite.email;
  await emitNotification(inviterId, templates.inviteAccepted, {
    params: { name: inviteeName(resolution, joined?.name), email },
    idempotencyKey,
  });
}

async function notifyInviteExpired(
  inviterId: string,
  resolution: InviteResolution,
  idempotencyKey: string,
): Promise<void> {
  await emitNotification(inviterId, templates.inviteExpired, {
    params: { email: resolution.invite.email },
    idempotencyKey,
  });
}

/** Invitation outcomes the inviter hears about. */
export type NotifiedInviteOutcome = "accepted" | "expired";

const INVITE_OUTCOME_SENDERS: Record<
  NotifiedInviteOutcome,
  typeof notifyInviteAccepted
> = {
  accepted: notifyInviteAccepted,
  expired: notifyInviteExpired,
};

/**
 * Tells the inviter an invitation was accepted or expired unanswered. The
 * terminal decision's id keys the delivery, so a replayed decision (the
 * cleanup cron retries incomplete ones) notifies once.
 */
export async function notifyInviteOutcome(
  tenantId: string,
  decisionId: string,
  outcome: NotifiedInviteOutcome,
): Promise<void> {
  const resolution = await GetModel(InviteResolutionsModel, tenantId).get(
    decisionId,
  );
  if (!resolution) return;
  const inviterId = await resolveInviterToNotify(resolution);
  if (!inviterId) return;
  await INVITE_OUTCOME_SENDERS[outcome](
    inviterId,
    resolution,
    `dms:invite-${outcome}:${decisionId}`,
  );
}

/** A member taken out of a workspace by someone else. */
export interface MemberRemoval {
  tenantId: string;
  removedUserId: string;
  actor: NotificationActor;
}

/** Tells the other owners, neither the remover nor the removed member. */
export async function notifyMemberRemoved({
  tenantId,
  removedUserId,
  actor,
}: MemberRemoval): Promise<void> {
  const recipients = recipientsExcept(await tenantOwnerIds(tenantId), [
    actor.id,
    removedUserId,
  ]);
  if (recipients.length === 0) return;
  const removed = await GetModel(UserModel).get(removedUserId);
  const email = removed?.email ?? "";
  await emitNotificationToEach(recipients, templates.memberRemoved, {
    params: { name: removed?.name || email, email, actor: actor.name },
  });
}

const ROLE_COUNT_TITLE_KEYS: Readonly<Record<number, string>> = {
  0: "title_none",
  1: "title_one",
};

async function roleNamesInOrder(
  tenantId: string,
  roleIds: readonly string[],
): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const roles = await GetModel(RoleModel, tenantId).getBy("_id", ...roleIds);
  const names = new Map(roles.map((role) => [role._id, role.name]));
  return roleIds.flatMap((id) => names.get(id) ?? []);
}

/** A member whose roles someone else changed. */
export interface MemberRolesChange {
  tenantId: string;
  userId: string;
  roleIds: readonly string[];
  actor: NotificationActor;
}

export async function notifyRolesChanged({
  tenantId,
  userId,
  roleIds,
  actor,
}: MemberRolesChange): Promise<void> {
  const names = await roleNamesInOrder(tenantId, roleIds);
  const template = {
    ...templates.rolesChanged,
    tone: rolesChangedTone(names.length),
  };
  await emitNotification(userId, template, {
    titleKey: ROLE_COUNT_TITLE_KEYS[names.length] ?? "title",
    params: { roles: names.join(ROLE_NAME_SEPARATOR), actor: actor.name },
  });
}

/** @param isOwner Whether the member is an owner now */
export async function notifyOwnershipChanged(
  userId: string,
  isOwner: boolean,
  actor: NotificationActor,
): Promise<void> {
  await emitNotification(
    userId,
    isOwner ? templates.ownershipGranted : templates.ownershipRemoved,
    { params: { actor: actor.name } },
  );
}

/** A role whose permissions were saved in the roles editor. */
export interface RolePermissionsEdit {
  tenantId: string;
  roleId: string;
  roleName: string;
  actor: NotificationActor;
}

/**
 * Folds the save into the owner's notification of the same role and editor
 * when it continues that editing session, so a burst of saves reads as one.
 *
 * @returns Whether the save was folded in, and needs no new notification
 */
async function continueEditingSession(
  ownerId: string,
  edit: RolePermissionsEdit,
  now: Date,
): Promise<boolean> {
  const [latest] = await GetModel(UserNotificationsModel).findMatching(
    ownerId,
    `${MESSAGES_PREFIX}.${templates.rolePermissionsChanged.messageId}.title`,
    { roleId: edit.roleId, actorId: edit.actor.id },
    new Date(now.getTime() - EDITING_SESSION_LOOKBACK_MS),
  );
  const editedAt = Number(latest?.params?.editedAt);
  if (!latest || !isWithinEditingSession(new Date(editedAt), now)) {
    return false;
  }
  await GetModel(UserNotificationsModel).update(latest._id, {
    params: { ...latest.params, role: edit.roleName, editedAt: now.getTime() },
  });
  return true;
}

async function notifyRoleOwner(
  ownerId: string,
  edit: RolePermissionsEdit,
  now: Date,
): Promise<void> {
  if (await continueEditingSession(ownerId, edit, now)) return;
  await emitNotification(ownerId, templates.rolePermissionsChanged, {
    params: {
      role: edit.roleName,
      actor: edit.actor.name,
      roleId: edit.roleId,
      actorId: edit.actor.id,
      editedAt: now.getTime(),
    },
  });
}

/**
 * Tells the other owners, once per role, editor and editing session. Never
 * rejects: the roles editor fires it after answering, so a failure left
 * unhandled would take the whole process down.
 */
export async function notifyRolePermissionsChanged(
  edit: RolePermissionsEdit,
): Promise<void> {
  try {
    const recipients = recipientsExcept(await tenantOwnerIds(edit.tenantId), [
      edit.actor.id,
    ]);
    const now = new Date();
    await Promise.all(
      recipients.map((ownerId) => notifyRoleOwner(ownerId, edit, now)),
    );
  } catch (error) {
    Logging.Error(
      `[DMS] Could not tell the owners of "${edit.tenantId}" that role "${edit.roleId}" changed: ${String(error)}`,
    );
  }
}
