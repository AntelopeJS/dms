import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  RoleModel,
  type TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import { syncPlatformOwnerOnTenantOwnerChange } from "@antelopejs/interface-dms/tenant-ownership";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import type { ConfirmDialogSerialized } from "@antelopejs/interface-dms/base/table-view";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const MEMBER_NOT_FOUND = "$page.settings.members.error.user_not_found";

/** How a tenant-owner flag moves on an edit, if it moves at all. */
export type OwnerChange = "promote" | "demote" | null;

/**
 * @param current The membership as stored
 * @param requested The owner flag the edit asks for, if it sets one
 */
export function detectOwnerChange(
  current: Pick<TenantMember, "isTenantOwner">,
  requested: boolean | undefined,
): OwnerChange {
  if (requested === undefined) return null;
  if (current.isTenantOwner === requested) return null;
  return requested ? "promote" : "demote";
}

/** Refuse to take the owner role from the tenant's last owner. */
export async function assertNotLastTenantOwner(
  tenantId: string,
  current: TenantMember,
): Promise<void> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const remaining = await memberModel.countOwnersExcluding([current.userId]);
  assert(
    remaining > 0,
    HTTP_CONFLICT,
    "$page.settings.members.error.last_owner",
  );
}

/**
 * Checks and side effects of an owner flag change, run before the membership
 * row is written — by the table's edit guard and by the owner route alike.
 */
export async function prepareOwnerChange(
  tenantId: string,
  current: TenantMember,
  requested: boolean | undefined,
): Promise<void> {
  const change = detectOwnerChange(current, requested);
  if (change === null) return;
  if (change === "demote") await assertNotLastTenantOwner(tenantId, current);
  await syncPlatformOwnerOnTenantOwnerChange(
    GetModel(UserModel),
    current.userId,
    tenantId,
    requested === true,
  );
}

/** Load a membership of the tenant, or answer 404. */
export async function requireMember(
  tenantId: string,
  memberId: string,
): Promise<TenantMember> {
  const member = await GetModel(TenantMemberModel, tenantId).get(memberId);
  assert(member, HTTP_NOT_FOUND, MEMBER_NOT_FOUND);
  return member;
}

/** A membership after an owner flag change, and how the flag moved. */
export interface OwnershipChangeResult {
  member: TenantMember;
  change: OwnerChange;
}

/** Give or take the owner role of a member. */
export async function setMemberOwnership(
  tenantId: string,
  memberId: string,
  isTenantOwner: boolean,
): Promise<OwnershipChangeResult> {
  const member = await requireMember(tenantId, memberId);
  const change = detectOwnerChange(
    { isTenantOwner: member.isTenantOwner === true },
    isTenantOwner,
  );
  await prepareOwnerChange(tenantId, member, isTenantOwner);
  member.isTenantOwner = isTenantOwner;
  await GetModel(TenantMemberModel, tenantId).update(member);
  return { member, change };
}

/** What removing a member takes away, for the confirmation to spell out. */
export interface MemberRemovalImpact {
  memberId: string;
  name: string;
  email: string;
  /** Names of the roles the member holds in the tenant. */
  roles: string[];
  isTenantOwner: boolean;
  /** Removing the member would leave the tenant without an owner. */
  isLastOwner: boolean;
  /** The member is the one asking. */
  isSelf: boolean;
}

async function roleNames(
  tenantId: string,
  roleIds: string[],
): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const roles = await GetModel(RoleModel, tenantId).getBy("_id", ...roleIds);
  return roles.map((role) => role.name);
}

/**
 * @param tenantId Tenant the member belongs to
 * @param memberId Membership to remove
 * @param requesterUserId User asking, to tell them they are removing themself
 */
export async function buildMemberRemovalImpact(
  tenantId: string,
  memberId: string,
  requesterUserId: string,
): Promise<MemberRemovalImpact> {
  const member = await requireMember(tenantId, memberId);
  const user = await GetModel(UserModel).get(member.userId);
  const otherOwners = await GetModel(
    TenantMemberModel,
    tenantId,
  ).countOwnersExcluding([member.userId]);
  return {
    memberId: member._id,
    name: user?.name ?? "",
    email: user?.email ?? "",
    roles: await roleNames(tenantId, member.roleIds ?? []),
    isTenantOwner: member.isTenantOwner === true,
    isLastOwner: member.isTenantOwner === true && otherOwners === 0,
    isSelf: member.userId === requesterUserId,
  };
}

const REMOVAL_I18N = "$page.settings.members.remove";

/**
 * The confirmation of a member's removal, worded for that member: the roles
 * they lose and that their records stay — or, for the last owner, why they
 * cannot be removed (an acknowledge-only dialog).
 */
export function memberRemovalConfirm(
  impact: MemberRemovalImpact,
): ConfirmDialogSerialized {
  const params = { name: impact.name || impact.email };
  if (impact.isLastOwner) {
    const key = impact.isSelf ? "last_owner_self" : "last_owner_other";
    return {
      title: `${REMOVAL_I18N}.${key}_title`,
      description: `${REMOVAL_I18N}.last_owner_description`,
      params,
      icon: "i-ph-crown",
      color: "warning",
      cancelLabel: "$page.settings.members.confirm.close",
      blocked: true,
    };
  }
  const who = impact.isSelf ? "self" : "other";
  const roles = impact.isTenantOwner
    ? "$page.settings.members.owner"
    : impact.roles.join(", ") || "$page.settings.members.no_role";
  return {
    title: `${REMOVAL_I18N}.title_${who}`,
    description: `${REMOVAL_I18N}.description_${who}`,
    params,
    icon: "i-ph-user-minus",
    color: "error",
    confirmLabel: `${REMOVAL_I18N}.confirm`,
    impact: [
      {
        icon: "i-ph-key",
        label: `${REMOVAL_I18N}.impact_roles`,
        count: roles,
      },
      { icon: "i-ph-note-pencil", label: `${REMOVAL_I18N}.impact_records` },
    ],
  };
}
