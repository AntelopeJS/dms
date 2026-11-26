import { HTTPResult, IsHTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  type Role,
  RoleModel,
  type TenantMember,
  TenantMemberModel,
  type UserInvite,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { expect } from "chai";
import { countRoleHolders } from "../../../../db";
import {
  collectPermissionIds,
  countKnownPermissions,
  listRoleHolderIds,
  loadRoleDeleteConfirm,
  loadRoleEditorTree,
  loadRolesOverview,
  prepareRoleDeletion,
  replaceRoleReference,
  ROLE_MEMBER_PREVIEW_LIMIT,
  type RoleSummary,
} from "../../../../pages/permissions";

const TENANT = "role-holder-reads";
const DELETE_TENANT = "role-holder-reads-delete";
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-01T00:00:00Z");
const CAPABILITIES = { canAdd: true, canEdit: true, canDelete: true };

const ROLE_KEYS = ["support", "admin", "ops-1", "ops-2", "unheld"];

/** The fields of a membership the in-memory answers read. */
type StoredMember = Pick<
  TenantMember,
  "_id" | "userId" | "roleIds" | "isTenantOwner"
>;

interface Fixture {
  roles: Role[];
  members: StoredMember[];
  invites: UserInvite[];
}

/** The rows of one tenant; ids start with `p`, as tenants share collections. */
function fixture(p: string, now: Date): Fixture {
  const later = new Date(now.getTime() + DAY_MS);
  const earlier = new Date(now.getTime() - DAY_MS);
  const role = (key: string, name: string, permissions: string[]): Role => ({
    _id: `${p}-${key}`,
    name,
    permissions,
    createdAt: NOW,
    updatedAt: NOW,
  });
  const member = (
    user: string,
    roleKeys: string[],
    isTenantOwner = false,
  ): TenantMember => ({
    _id: `${p}-member-${user}`,
    userId: `${p}-${user}`,
    roleIds: roleKeys.map((key) => `${p}-${key}`),
    isTenantOwner,
    joinedAt: NOW,
    invitedBy: null,
  });
  const invite = (
    key: string,
    roleKeys: string[],
    expiresAt: Date,
  ): UserInvite => ({
    _id: `${p}-invite-${key}`,
    roles_ids: roleKeys.map((roleKey) => `${p}-${roleKey}`),
    expiresAt,
    createdAt: NOW,
    email: `${p}-${key}@role-holder-reads.test`,
    firstname: null,
    lastname: null,
    language: "en",
    token: `${p}-token-${key}`,
    asTenantOwner: false,
    extensions: null,
  });
  return {
    roles: [
      role("support", "Support", ["a"]),
      role("admin", "Admin", ["a", "legacy"]),
      role("ops-1", "Ops", []),
      role("ops-2", "Ops", []),
      role("unheld", "Unheld", []),
    ],
    members: [
      member("u4", ["admin"]),
      member("u1", ["admin"], true),
      member("u2", ["admin", "support"]),
      member("u5", []),
      member("u3", ["admin", "ops-1"]),
      member("u6", [], true),
      member("u7", ["ops-1"]),
    ],
    invites: [
      invite("support-pending", ["support"], later),
      invite("support-expired", ["support"], earlier),
      invite("admin-pending", ["admin"], later),
      invite("admin-expired", ["admin"], earlier),
      invite("both-at-now", ["admin", "support"], now),
      invite("ops-pending", ["ops-2"], later),
    ],
  };
}

async function seed(tenantId: string, rows: Fixture): Promise<void> {
  await GetModel(RoleModel, tenantId).insert(rows.roles);
  await GetModel(TenantMemberModel, tenantId).insert(rows.members);
  await GetModel(UserInviteModel, tenantId).insert(rows.invites);
  await GetModel(TenantMemberModel, tenantId)
    .table.insert({
      _id: `${tenantId}-member-without-roles`,
      userId: `${tenantId}-without-roles`,
      isTenantOwner: false,
      joinedAt: NOW,
      invitedBy: null,
    })
    .run();
  await GetModel(UserInviteModel, tenantId)
    .table.insert({
      _id: `${tenantId}-invite-without-roles`,
      expiresAt: new Date(Date.now() + DAY_MS),
      createdAt: NOW,
      email: `${tenantId}-without-roles@role-holder-reads.test`,
      language: "en",
      token: `${tenantId}-token-without-roles`,
      asTenantOwner: false,
    })
    .run();
}

function isInvitePending(invite: UserInvite, now: Date): boolean {
  return new Date(invite.expiresAt).getTime() > now.getTime();
}

function holdsRole(roleId: string, member: StoredMember): boolean {
  return (member.roleIds ?? []).includes(roleId);
}

function pendingInvitesFor(
  roleId: string,
  invites: UserInvite[],
  now: Date,
): UserInvite[] {
  return invites.filter(
    (invite) =>
      isInvitePending(invite, now) && (invite.roles_ids ?? []).includes(roleId),
  );
}

function countRoleHoldersInJs(
  roleId: string,
  members: StoredMember[],
  invites: UserInvite[],
  now: Date,
): number {
  return (
    members.filter((member) => holdsRole(roleId, member)).length +
    pendingInvitesFor(roleId, invites, now).length
  );
}

function previewInJs(members: StoredMember[], userNames: Map<string, string>) {
  return members.slice(0, ROLE_MEMBER_PREVIEW_LIMIT).map((member) => ({
    userId: member.userId,
    name: userNames.get(member.userId) ?? "",
  }));
}

function summarizeRolesInJs(
  { roles, members, invites }: Fixture,
  userNames: Map<string, string>,
  knownPermissionIds: Set<string>,
  now: Date,
): RoleSummary[] {
  return [...roles]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((role) => {
      const holders = members.filter((member) => holdsRole(role._id, member));
      const permissions = role.permissions ?? [];
      return {
        _id: role._id,
        name: role.name,
        description: role.description ?? "",
        permissions,
        permissionCount: countKnownPermissions(permissions, knownPermissionIds),
        memberCount: holders.length,
        members: previewInJs(holders, userNames),
        inviteCount: pendingInvitesFor(role._id, invites, now).length,
      };
    });
}

async function storedRows(tenantId: string) {
  const [members, invites] = await Promise.all([
    GetModel(TenantMemberModel, tenantId)
      .table.pluck("_id", "userId", "roleIds", "isTenantOwner")
      .run(),
    GetModel(UserInviteModel, tenantId).getAll(),
  ]);
  return { members, invites };
}

async function storedRoleLists(tenantId: string) {
  const { members, invites } = await storedRows(tenantId);
  return {
    members: members.map((row) => ({
      id: row._id,
      roleIds: row.roleIds ?? [],
    })),
    invites: invites.map((row) => ({
      id: row._id,
      roleIds: row.roles_ids ?? [],
    })),
  };
}

async function seedAll(): Promise<void> {
  await GetModel(UserModel).insert(
    ["rhr-u1", "rhr-u2", "rhr-u3", "rhr-u4", "rhr-u6"].map((id, index) => ({
      _id: id,
      email: `${id}@role-holder-reads.test`,
      name: `User ${index}`,
      authKey: `${id}-key`,
      isValidated: true,
      language: "en",
      password: null,
      owner: false,
    })),
  );
  await seed(TENANT, fixture("rhr", new Date()));
  await seed(DELETE_TENANT, fixture("rhd", new Date()));
}

describe("[unit] pages/settings/users role holder reads match the in-memory answer", () => {
  before(seedAll);

  it("summarizes every role and the owners as the in-memory summary did, previews in stored order", async () => {
    const overview = await loadRolesOverview(
      { tenantId: TENANT, permissions: new Set(["*"]) },
      CAPABILITIES,
    );

    const { members, invites } = await storedRows(TENANT);
    const roles = await GetModel(RoleModel, TENANT).getAll();
    const users = await GetModel(UserModel).getBy(
      "_id",
      ...members.map((row) => row.userId),
    );
    const userNames = new Map(users.map((user) => [user._id, user.name]));
    const known = new Set(collectPermissionIds(await loadRoleEditorTree()));
    const owners = members.filter((row) => row.isTenantOwner === true);

    expect(overview.roles).to.deep.equal(
      summarizeRolesInJs(
        { roles, members, invites },
        userNames,
        known,
        new Date(),
      ),
    );
    expect(overview.owners).to.deep.equal({
      memberCount: owners.length,
      members: previewInJs(owners, userNames),
    });
    const admin = overview.roles.find((role) => role._id === "rhr-admin");
    expect(admin?.memberCount).to.equal(4);
    expect(admin?.members).to.have.length(ROLE_MEMBER_PREVIEW_LIMIT);
  });

  it("counts holders as the in-memory count did, leaving out an invite expiring at the same instant", async () => {
    const { members, invites } = await storedRows(TENANT);
    const [atNow] = invites.filter(
      (row) => row._id === "rhr-invite-both-at-now",
    );
    expect(atNow, "the invite expiring at the instant counted").to.not.equal(
      undefined,
    );
    const at = new Date(atNow?.expiresAt ?? 0);

    for (const key of ROLE_KEYS) {
      const roleId = `rhr-${key}`;
      expect(
        await countRoleHolders(
          GetModel(TenantMemberModel, TENANT),
          GetModel(UserInviteModel, TENANT),
          roleId,
          at,
        ),
        roleId,
      ).to.equal(countRoleHoldersInJs(roleId, members, invites, at));
    }
    expect(countRoleHoldersInJs("rhr-admin", members, invites, at)).to.equal(5);
  });

  it("words the delete dialog with the in-memory count", async () => {
    const { members, invites } = await storedRows(TENANT);
    const dialog = await loadRoleDeleteConfirm(TENANT, "rhr-support");
    expect(dialog.params).to.deep.equal({
      name: "Support",
      count: countRoleHoldersInJs("rhr-support", members, invites, new Date()),
    });
  });

  it("lists the holders of a role in stored order, as the in-memory filter did", async () => {
    const { members } = await storedRows(TENANT);
    for (const key of ROLE_KEYS) {
      const roleId = `rhr-${key}`;
      expect(await listRoleHolderIds(TENANT, roleId), roleId).to.deep.equal(
        members
          .filter((row) => holdsRole(roleId, row))
          .map((row) => row.userId),
      );
    }
  });

  it("refuses to delete a role only pending invitations hold, and lets an unheld one through", async () => {
    const refusal = await prepareRoleDeletion(
      TENANT,
      ["rhr-ops-2"],
      undefined,
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(refusal).to.be.instanceOf(HTTPResult);
    expect(IsHTTPResult(refusal) && refusal.getStatus()).to.equal(409);
    expect(
      await prepareRoleDeletion(TENANT, ["rhr-unheld"], undefined),
    ).to.equal(undefined);
  });

  it("rewrites the same members and invitations, expired ones included, as the in-memory move did", async () => {
    const moved = (row: { id: string; roleIds: string[] }) => ({
      id: row.id,
      roleIds:
        replaceRoleReference(row.roleIds, "rhd-admin", "rhd-support") ??
        row.roleIds,
    });
    const before = await storedRoleLists(DELETE_TENANT);

    await prepareRoleDeletion(DELETE_TENANT, ["rhd-admin"], {
      reassignTo: "rhd-support",
    });

    expect(await storedRoleLists(DELETE_TENANT)).to.deep.equal({
      members: before.members.map(moved),
      invites: before.invites.map(moved),
    });
    expect((await storedRoleLists(DELETE_TENANT)).invites).to.deep.include({
      id: "rhd-invite-admin-expired",
      roleIds: ["rhd-support"],
    });
  });
});
