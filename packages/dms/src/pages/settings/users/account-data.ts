// What "Your data" on the profile page exports and what it checks before an
// account is deleted. Pure: the store (account-data-store.ts) reads the rows.

import {
  normalizeEmail,
  type Session,
  type User,
  type UserExternalIdentity,
} from "@antelopejs/interface-dms/auth/db";
import type { TenantMember, UserInvite } from "@antelopejs/interface-dms/db";
import type { UserNotification } from "../../../db";
import {
  type RegionalPreferences,
  readRegionalPreferences,
} from "./regional-preferences";

export const ACCOUNT_EXPORT_FORMAT = "dms-account-export";
export const ACCOUNT_EXPORT_VERSION = 1;

/** One membership, with the names the export and the guards need. */
export interface AccountMembershipSource {
  tenantId: string;
  tenantName: string;
  member: TenantMember;
  roleNames: string[];
  /** Owners of the tenant other than this user. */
  otherOwners: number;
}

/** An invitation the user sent, with the tenant it invites to. */
export interface AccountInviteSource {
  tenantId: string;
  invite: UserInvite;
  roleNames: string[];
}

/** Every row the export is built from. */
export interface AccountExportSources {
  user: User;
  notificationPreferences: Record<string, boolean>;
  memberships: AccountMembershipSource[];
  notifications: UserNotification[];
  sessions: Session[];
  identities: UserExternalIdentity[];
  invitesSent: AccountInviteSource[];
  exportedAt: Date;
}

export interface AccountExportProfile {
  id: string;
  name: string;
  email: string;
  emailValidated: boolean;
  avatar: string | null;
  isPlatformOwner: boolean;
  hasPassword: boolean;
  passwordChangedAt: Date | null;
  twoFactorMethods: string[];
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt: Date | null;
}

/** The language, regional and notification preferences of the user. */
export interface AccountExportPreferences extends RegionalPreferences {
  notifications: Record<string, boolean>;
}

/** The downloaded file: no password, two-factor secret, code or token. */
export interface AccountExport {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  version: typeof ACCOUNT_EXPORT_VERSION;
  exportedAt: Date;
  profile: AccountExportProfile;
  preferences: AccountExportPreferences;
  memberships: Record<string, unknown>[];
  notifications: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  externalIdentities: Record<string, unknown>[];
  invitesSent: Record<string, unknown>[];
}

/** Profile fields picked one by one: a field added later is not exported by accident. */
function exportProfile(user: User): AccountExportProfile {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    emailValidated: user.isValidated === true,
    avatar: user.avatar?.key ?? null,
    isPlatformOwner: user.owner === true,
    hasPassword: !!user.password,
    passwordChangedAt: user.passwordChangedAt ?? null,
    twoFactorMethods: user.twoFactorMethods ?? [],
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastActiveAt: user.lastActiveAt ?? null,
  };
}

const exportMembership = (source: AccountMembershipSource) => ({
  tenantId: source.tenantId,
  tenantName: source.tenantName,
  isTenantOwner: source.member.isTenantOwner === true,
  roles: source.roleNames,
  joinedAt: source.member.joinedAt,
  invitedBy: source.member.invitedBy ?? null,
});

const exportNotification = (notification: UserNotification) => ({
  id: notification._id,
  title: notification.title,
  description: notification.description,
  linkTo: notification.linkTo,
  params: notification.params,
  tone: notification.tone,
  categoryId: notification.categoryId,
  subjectId: notification.subjectId,
  isRead: notification.isRead,
  createdAt: notification.createdAt,
});

const exportSession = (session: Session) => ({
  id: session._id,
  browser: session.browser,
  os: session.os,
  deviceType: session.deviceType,
  ip: session.ip,
  location: session.location,
  userAgent: session.userAgent,
  createdAt: session.createdAt,
  lastActiveAt: session.lastActiveAt,
});

const exportIdentity = (identity: UserExternalIdentity) => ({
  provider: identity.provider,
  email: identity.email,
  linkedAt: identity.createdAt,
  lastLoginAt: identity.lastLoginAt,
});

const exportInvite = (source: AccountInviteSource, now: Date) => ({
  tenantId: source.tenantId,
  email: source.invite.email,
  firstname: source.invite.firstname,
  lastname: source.invite.lastname,
  roles: source.roleNames,
  asTenantOwner: source.invite.asTenantOwner === true,
  createdAt: source.invite.createdAt,
  expiresAt: source.invite.expiresAt,
  status: new Date(source.invite.expiresAt) > now ? "pending" : "expired",
});

/**
 * Everything the DMS keeps about a user, as their export file. Each record is
 * rebuilt field by field, so the secrets stored next to these fields
 * (password hash, two-factor secrets and codes, refresh tokens, invite
 * tokens, provider tokens) never reach it.
 */
export function buildAccountExport(
  sources: AccountExportSources,
): AccountExport {
  const { user, exportedAt } = sources;
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    exportedAt,
    profile: exportProfile(user),
    preferences: {
      ...readRegionalPreferences(user),
      notifications: { ...sources.notificationPreferences },
    },
    memberships: sources.memberships.map(exportMembership),
    notifications: sources.notifications.map(exportNotification),
    sessions: sources.sessions.map(exportSession),
    externalIdentities: sources.identities.map(exportIdentity),
    invitesSent: sources.invitesSent.map((invite) =>
      exportInvite(invite, exportedAt),
    ),
  };
}

/** Why an account cannot be deleted yet. */
export interface DeletionBlocker {
  /** `tenant`: last owner of a workspace; `platform`: last platform owner. */
  kind: "tenant" | "platform";
  tenantId?: string;
  tenantName?: string;
}

/** Platform ownership facts the guard needs. */
export interface PlatformOwnership {
  isPlatformOwner: boolean;
  otherPlatformOwners: number;
}

/**
 * The workspaces, and the platform, that would be left without an owner. The
 * same rule as removing a member: the last owner goes only once someone else
 * owns it.
 */
export function findDeletionBlockers(
  memberships: AccountMembershipSource[],
  platform: PlatformOwnership,
): DeletionBlocker[] {
  const blockers: DeletionBlocker[] = memberships
    .filter(
      (source) =>
        source.member.isTenantOwner === true && source.otherOwners === 0,
    )
    .map((source) => ({
      kind: "tenant",
      tenantId: source.tenantId,
      tenantName: source.tenantName,
    }));
  if (platform.isPlatformOwner && platform.otherPlatformOwners === 0) {
    blockers.push({ kind: "platform" });
  }
  return blockers;
}

/** Whether the typed confirmation is the account's e-mail, whatever its case. */
export function isDeletionConfirmed(user: User, confirmation: string): boolean {
  return normalizeEmail(confirmation) === normalizeEmail(user.email);
}

/**
 * At most one export per user per window: the export reads every table the
 * user has rows in, and the button sits one click away.
 */
export class AccountExportThrottle {
  private readonly lastExportAt = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  /** Records an export of `userId` at `now`, or refuses one inside the window. */
  tryAcquire(userId: string, now: number): boolean {
    const last = this.lastExportAt.get(userId);
    if (last !== undefined && now - last < this.windowMs) return false;
    this.lastExportAt.set(userId, now);
    this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [userId, at] of this.lastExportAt) {
      if (now - at >= this.windowMs) this.lastExportAt.delete(userId);
    }
  }
}
