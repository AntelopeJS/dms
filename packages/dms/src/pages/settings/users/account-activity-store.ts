// Reads the rows the "Recent account activity" card is built from: the
// user's sessions, notifications, memberships and the invitations they sent.
// The merge itself is in account-activity.ts.

import { Logging } from "@antelopejs/interface-core/logging";
import { CROSS_INSTANCE } from "@antelopejs/interface-database";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  SessionModel,
  type User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import {
  TenantMemberModel,
  TenantModel,
  type UserInvite,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { UserNotificationsModel } from "../../../db";
import {
  ACCOUNT_ACTIVITY_LIMIT,
  type AccountActivityEvent,
  type ActivityInviteSource,
  type ActivityMembershipSource,
  buildAccountActivity,
} from "./account-activity";

/**
 * Latest notifications read: other subjects (modules, automations) share the
 * feed, so a few more than the card shows are scanned for account ones.
 */
const NOTIFICATIONS_SCANNED = 50;
/** Workspaces whose invitations are read, the most recently joined first. */
const INVITE_WORKSPACES_SCANNED = 10;

/** One source's rows, or none when it fails: the others still show. */
async function orEmpty<T>(label: string, load: () => Promise<T[]>) {
  try {
    return await load();
  } catch (error) {
    Logging.Warn(
      `[DMS] Account activity: ${label} unavailable: ${String(error)}`,
    );
    return [] as T[];
  }
}

async function loadMemberships(
  userId: string,
): Promise<Array<ActivityMembershipSource & { tenantId: string }>> {
  const rows = await GetModel(
    TenantMemberModel,
    CROSS_INSTANCE,
  ).listByUserWithTenantIds(userId);
  if (rows.length === 0) return [];
  const tenants = await GetModel(TenantModel).getMany(
    rows.map((row) => row.tenantId),
  );
  const names = new Map(tenants.map((tenant) => [tenant._id, tenant.name]));
  const inviterIds = [
    ...new Set(
      rows
        .map((row) => row.member.invitedBy)
        .filter((id): id is string => !!id && id !== userId),
    ),
  ];
  const inviters = inviterIds.length
    ? await GetModel(UserModel).getBy("_id", ...inviterIds)
    : [];
  const inviterNames = new Map(inviters.map((user) => [user._id, user.name]));
  return rows.map(({ tenantId, member }) => ({
    tenantId,
    member,
    workspace: names.get(tenantId) ?? tenantId,
    invitedByName: member.invitedBy
      ? inviterNames.get(member.invitedBy)
      : undefined,
  }));
}

async function invitesSentIn(
  tenantId: string,
  workspace: string,
  userId: string,
): Promise<ActivityInviteSource[]> {
  const rows = await GetModel(UserInviteModel, tenantId)
    .table.filter((row) => row.key("invitedBy").eq(userId))
    .orderBy("createdAt", "desc")
    .slice(0, ACCOUNT_ACTIVITY_LIMIT)
    .run();
  return rows
    .map((row) => UserInviteModel.fromDatabase(row))
    .filter((invite): invite is UserInvite => invite !== undefined)
    .map((invite) => ({ invite, workspace }));
}

/**
 * The latest events of `user`'s own account, newest first.
 *
 * @param user The signed-in user
 * @param currentSessionId Session the request comes from, if known
 */
export async function loadAccountActivity(
  user: User,
  currentSessionId?: string,
): Promise<AccountActivityEvent[]> {
  const [sessions, notifications, memberships] = await Promise.all([
    orEmpty("sessions", () => GetModel(SessionModel).getByUserId(user._id)),
    orEmpty("notifications", () =>
      GetModel(UserNotificationsModel).getByUserId(
        user._id,
        NOTIFICATIONS_SCANNED,
        0,
      ),
    ),
    orEmpty("memberships", () => loadMemberships(user._id)),
  ]);
  const recentWorkspaces = [...memberships]
    .sort(
      (a, b) =>
        new Date(b.member.joinedAt).getTime() -
        new Date(a.member.joinedAt).getTime(),
    )
    .slice(0, INVITE_WORKSPACES_SCANNED);
  const invites = (
    await Promise.all(
      recentWorkspaces.map(({ tenantId, workspace }) =>
        orEmpty("invitations", () =>
          invitesSentIn(tenantId, workspace, user._id),
        ),
      ),
    )
  ).flat();
  return buildAccountActivity({
    user,
    sessions,
    notifications,
    memberships,
    invites,
    currentSessionId,
  });
}
