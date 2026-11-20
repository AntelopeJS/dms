import { randomUUID } from "node:crypto";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  RoleModel,
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import { InviteResolutionsModel } from "@antelopejs/interface-dms/db/internal/inviteResolutions.model";
import {
  Hook,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { completeInviteResolution } from "@antelopejs/interface-dms/invite-resolution";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import type { AxiosInstance } from "axios";
import { expect } from "chai";
import {
  connectAutomationEventSources,
  disconnectAutomationEventSources,
} from "../../automation";
import { runCleanupUserInvites } from "../../crons";
import { deleteAccount } from "../../pages/account";
import { prepareRoleDeletion } from "../../pages/settings/users/role-editor-store";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../helpers/auth";
import { type ArmedTrigger, armTrigger } from "../helpers/automation-nodes";
import { resetDatabase } from "../helpers/db";

const INVITES = pageRoutePath("/settings/workspace/invites");
const MEMBERS = pageRoutePath("/settings/workspace/members");
const MEMBERS_TABLE = "/api/tables/members";
const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_PAYMENT_REQUIRED = 402;
const HOUR_MS = 3_600_000;

async function insertInvite(
  tenantId: string,
  email: string,
  expiresAt = new Date(Date.now() + HOUR_MS),
): Promise<string> {
  const [inviteId] = await GetModel(UserInviteModel, tenantId).insert({
    email,
    roles_ids: [],
    language: "en",
    token: randomUUID(),
    asTenantOwner: false,
    expiresAt,
  });
  return inviteId;
}

async function memberRowId(userId: string): Promise<string> {
  const member = await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).getByUser(
    userId,
  );
  if (!member) throw new Error(`${userId} is no member`);
  return member._id;
}

async function editRoles(
  client: AxiosInstance,
  member: RegisteredUser,
  roleIds: string[],
) {
  return client.put(
    `${MEMBERS_TABLE}/edit`,
    { roleIds },
    { params: { id: await memberRowId(member.userId) } },
  );
}

async function during(
  armed: ArmedTrigger,
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } finally {
    await armed.disarm();
  }
}

describe("[integration] automation trigger dms.invite-resolved", () => {
  let owner: AxiosInstance;

  beforeEach(async () => {
    await resetDatabase();
    owner = authorizedClient((await registerUser({ owner: true })).accessToken);
  });

  it("fires cancelled with the resolution id when the Revoke route cancels", async () => {
    const inviteId = await insertInvite(
      DEFAULT_TENANT_ID,
      "revoked@test.local",
    );
    const armed = await armTrigger("dms.invite-resolved");
    await during(armed, async () => {
      const response = await owner.delete(`${INVITES}/${inviteId}/cancel`);
      expect(response.status, JSON.stringify(response.data)).to.be.oneOf([
        HTTP_OK,
        HTTP_NO_CONTENT,
      ]);
    });
    const resolution = await GetModel(
      InviteResolutionsModel,
      DEFAULT_TENANT_ID,
    ).getForInvite(DEFAULT_TENANT_ID, inviteId);
    expect(armed.events).to.have.length(1);
    const [event] = armed.events;
    expect(event).to.include({
      tenantId: DEFAULT_TENANT_ID,
      inviteId,
      email: "revoked@test.local",
      reason: "cancelled",
      deliveryId: resolution?._id,
    });
    expect(Object.keys(event)).to.have.members([
      "tenantId",
      "inviteId",
      "email",
      "reason",
      "deliveryId",
      "at",
    ]);
    expect(
      await GetModel(UserInviteModel, DEFAULT_TENANT_ID).get(inviteId),
    ).to.equal(undefined);
  });

  it("fires expired from the expiry cron, filtered by reason and tenant", async () => {
    await insertInvite(DEFAULT_TENANT_ID, "late@test.local", new Date(0));
    const all = await armTrigger("dms.invite-resolved");
    const expiredOnly = await armTrigger("dms.invite-resolved", {
      reasons: ["expired"],
      tenantId: DEFAULT_TENANT_ID,
    });
    const acceptedOnly = await armTrigger("dms.invite-resolved", {
      reasons: ["accepted"],
    });
    const otherTenant = await armTrigger("dms.invite-resolved", {
      tenantId: "another-tenant",
    });
    try {
      await runCleanupUserInvites();
    } finally {
      for (const armed of [all, expiredOnly, acceptedOnly, otherTenant])
        await armed.disarm();
    }
    expect(all.events.map((event) => event.reason)).to.deep.equal(["expired"]);
    expect(expiredOnly.events).to.have.length(1);
    expect(acceptedOnly.events).to.deep.equal([]);
    expect(otherTenant.events).to.deep.equal([]);
  });

  it("repeats the delivery id when a completion is replayed, and stops once disconnected", async () => {
    const inviteId = await insertInvite(DEFAULT_TENANT_ID, "again@test.local");
    const armed = await armTrigger("dms.invite-resolved");
    await during(armed, async () => {
      await owner.delete(`${INVITES}/${inviteId}/cancel`);
      const resolution = await GetModel(
        InviteResolutionsModel,
        DEFAULT_TENANT_ID,
      ).getForInvite(DEFAULT_TENANT_ID, inviteId);
      if (!resolution) throw new Error("no resolution");
      await GetModel(InviteResolutionsModel, DEFAULT_TENANT_ID).update(
        resolution._id,
        { completed: false },
      );
      await completeInviteResolution(resolution);
      disconnectAutomationEventSources();
      try {
        await GetModel(InviteResolutionsModel, DEFAULT_TENANT_ID).update(
          resolution._id,
          { completed: false },
        );
        await completeInviteResolution(resolution);
      } finally {
        connectAutomationEventSources();
      }
    });
    const ids = armed.events.map((event) => event.deliveryId);
    expect(ids).to.have.length(2);
    expect(ids[0]).to.equal(ids[1]);
  });
});

interface RolesFixture {
  owner: AxiosInstance;
  ownerUser: RegisteredUser;
  member: RegisteredUser;
  roleId: string;
}

function registerOwnerChangeCases(fx: () => RolesFixture): void {
  it("fires origin ownership from the owner route, which includeOwnership false drops", async () => {
    const armed = await armTrigger("dms.member-roles-changed");
    const rolesOnly = await armTrigger("dms.member-roles-changed", {
      includeOwnership: false,
    });
    try {
      const response = await fx().owner.post(
        `${MEMBERS}/${await memberRowId(fx().member.userId)}/owner`,
        { isTenantOwner: true },
      );
      expect(response.status, JSON.stringify(response.data)).to.be.oneOf([
        HTTP_OK,
        HTTP_NO_CONTENT,
      ]);
    } finally {
      await armed.disarm();
      await rolesOnly.disarm();
    }
    expect(armed.events).to.have.length(1);
    expect(armed.events[0]).to.deep.include({
      origin: "ownership",
      isTenantOwner: true,
      previousIsTenantOwner: false,
      actorId: fx().ownerUser.userId,
    });
    expect(rolesOnly.events).to.deep.equal([]);
  });

  it("fires origin role-deleted for each member moved off a deleted role", async () => {
    const [replacement] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: "Readers",
      permissions: [],
    });
    await editRoles(fx().owner, fx().member, [fx().roleId]);
    const armed = await armTrigger("dms.member-roles-changed");
    await during(armed, async () => {
      await prepareRoleDeletion(
        DEFAULT_TENANT_ID,
        [fx().roleId],
        { reassignTo: replacement },
        fx().ownerUser.userId,
      );
    });
    expect(armed.events).to.have.length(1);
    expect(armed.events[0]).to.deep.include({
      userId: fx().member.userId,
      origin: "role-deleted",
      roleIds: [replacement],
      previousRoleIds: [fx().roleId],
      actorId: fx().ownerUser.userId,
    });
  });
}

describe("[integration] automation trigger dms.member-roles-changed", () => {
  let owner: AxiosInstance;
  let ownerUser: RegisteredUser;
  let member: RegisteredUser;
  let roleId: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerUser = await registerUser({ owner: true });
    owner = authorizedClient(ownerUser.accessToken);
    member = await registerUser();
    [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: "Support",
      permissions: [],
    });
  });

  it("fires once with before and after when the members table edits roles", async () => {
    const armed = await armTrigger("dms.member-roles-changed");
    await during(armed, async () => {
      const response = await editRoles(owner, member, [roleId]);
      expect(response.status, JSON.stringify(response.data)).to.equal(HTTP_OK);
    });
    expect(armed.events).to.have.length(1);
    expect(armed.events[0]).to.deep.include({
      tenantId: DEFAULT_TENANT_ID,
      userId: member.userId,
      roleIds: [roleId],
      previousRoleIds: [],
      addedRoleIds: [roleId],
      removedRoleIds: [],
      isTenantOwner: false,
      previousIsTenantOwner: false,
      origin: "member-edit",
      actorId: ownerUser.userId,
    });
    expect(armed.events[0]).to.not.have.property("originProcedureId");
  });

  it("fires nothing for a no-op edit or a vetoed one, and filters by tenant", async () => {
    const armed = await armTrigger("dms.member-roles-changed");
    const elsewhere = await armTrigger("dms.member-roles-changed", {
      tenantId: "another-tenant",
    });
    const veto = () => {
      throw new HTTPResult(HTTP_PAYMENT_REQUIRED, "no role changes");
    };
    try {
      await editRoles(owner, member, []);
      RegisterHook(Hook.MEMBER_BEING_CHANGED, veto);
      try {
        expect((await editRoles(owner, member, [roleId])).status).to.equal(
          HTTP_PAYMENT_REQUIRED,
        );
      } finally {
        UnregisterHook(Hook.MEMBER_BEING_CHANGED, veto);
      }
      await editRoles(owner, member, [roleId]);
    } finally {
      await armed.disarm();
      await elsewhere.disarm();
    }
    expect(armed.events.map((event) => event.addedRoleIds)).to.deep.equal([
      [roleId],
    ]);
    expect(elsewhere.events).to.deep.equal([]);
  });

  registerOwnerChangeCases(() => ({ owner, ownerUser, member, roleId }));
});

describe("[integration] automation trigger dms.user-deleted", () => {
  beforeEach(resetDatabase);

  it("fires once with the workspaces left and no tenantId, even when another handler fails", async () => {
    const owner = await registerUser({ owner: true });
    const leaving = await registerUser();
    const failing = () => {
      throw new Error("other module failed");
    };
    RegisterHook(Hook.USER_DELETED, failing);
    const armed = await armTrigger("dms.user-deleted");
    try {
      const user = await GetModel(UserModel).get(leaving.userId);
      if (!user) throw new Error("no user");
      await deleteAccount(user);
    } finally {
      UnregisterHook(Hook.USER_DELETED, failing);
      await armed.disarm();
    }
    expect(owner.userId).to.not.equal(leaving.userId);
    expect(armed.events).to.have.length(1);
    expect(armed.events[0]).to.deep.include({
      userId: leaving.userId,
      email: leaving.email,
      tenantIds: [DEFAULT_TENANT_ID],
      reason: "self",
      deliveryId: `user-deleted:${leaving.userId}`,
    });
    expect(armed.events[0]).to.not.have.property("tenantId");
  });
});
