import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { TenantMemberModel, TenantModel } from "@antelopejs/interface-dms/db";
import { closeTenantLifecycleAdmission } from "@antelopejs/interface-dms/tenant-lifecycle";
import { expect } from "chai";
import {
  GET_TENANT_ACTION_ID,
  GET_USER_ACTION_ID,
  LIST_MEMBERS_ACTION_ID,
} from "../../automation";
import { findAction, objectsOf, runAction } from "../helpers/automation-nodes";
import { resetDatabase } from "../helpers/db";

const TENANT_A = "automation-users-a";
const TENANT_B = "automation-users-b";

const GET_USER_KEYS = [
  "found",
  "userId",
  "email",
  "name",
  "language",
  "timeZone",
  "isValidated",
  "isPlatformOwner",
  "createdAt",
  "lastActiveAt",
  "isMember",
  "isTenantOwner",
  "roleIds",
];

async function insertUser(email: string, name: string): Promise<string> {
  const [id] = await GetModel(UserModel).insert({
    email,
    name,
    language: "fr",
    timeZone: "Europe/Paris",
    password: "secret-hash",
    authKey: "secret-key",
    twoFactorSecret: "secret-2fa",
    isValidated: true,
    owner: false,
    lastActiveAt: new Date(5_000),
  });
  return id;
}

async function addMember(
  tenantId: string,
  userId: string,
  fields: { roleIds?: string[]; isTenantOwner?: boolean; joinedAt: number },
): Promise<void> {
  await GetModel(TenantMemberModel, tenantId)
    .table.insert({
      userId,
      roleIds: fields.roleIds ?? [],
      isTenantOwner: fields.isTenantOwner ?? false,
      joinedAt: new Date(fields.joinedAt),
    })
    .run();
}

interface Seeded {
  ada: string;
  bob: string;
  cleo: string;
}

function registerGetUserCases(ids: () => Seeded): void {
  describe("dms.get-user", () => {
    it("reads a user by id, with their membership in the tenant, and only allowlisted fields", async () => {
      const output = await runAction(GET_USER_ACTION_ID, {
        userId: ids().ada,
        tenantId: TENANT_A,
      });
      expect(Object.keys(output)).to.have.members(GET_USER_KEYS);
      expect(output).to.deep.include({
        found: true,
        userId: ids().ada,
        email: "ada@test.local",
        name: "Ada",
        isMember: true,
        isTenantOwner: true,
        roleIds: ["editor"],
        lastActiveAt: new Date(5_000).toISOString(),
      });
    });

    it("finds a user by email in other casing, not a member of another tenant", async () => {
      const output = await runAction(GET_USER_ACTION_ID, {
        email: "ADA@Test.Local",
        tenantId: TENANT_B,
      });
      expect(output).to.deep.include({
        found: true,
        userId: ids().ada,
        isMember: false,
        isTenantOwner: false,
        roleIds: [],
      });
    });

    it("answers found false for an unknown user", async () => {
      expect(
        await runAction(GET_USER_ACTION_ID, { email: "nobody@test.local" }),
      ).to.deep.equal({ found: false });
    });
  });
}

function registerListMembersCases(ids: () => Seeded): void {
  describe("dms.list-members", () => {
    it("lists one tenant's members oldest first, with their user fields", async () => {
      const output = await runAction(LIST_MEMBERS_ACTION_ID, {
        tenantId: TENANT_A,
      });
      expect(output.total).to.equal(3);
      expect(output.hasMore).to.equal(false);
      const members = objectsOf(output.members);
      expect(members.map((member) => member.userId)).to.deep.equal([
        ids().bob,
        ids().ada,
        ids().cleo,
      ]);
      expect(members[0]).to.deep.include({
        email: "bob@test.local",
        name: "Bob",
        language: "fr",
        roleIds: ["viewer"],
        isTenantOwner: false,
        joinedAt: new Date(1_000).toISOString(),
      });
    });

    it("filters owners and members holding any of the roles", async () => {
      const owners = await runAction(LIST_MEMBERS_ACTION_ID, {
        tenantId: TENANT_A,
        ownersOnly: true,
      });
      expect(owners.total).to.equal(1);
      const viewers = await runAction(LIST_MEMBERS_ACTION_ID, {
        tenantId: TENANT_A,
        roleIds: ["viewer", "missing"],
      });
      expect(viewers.total).to.equal(2);
      const ownerEditors = await runAction(LIST_MEMBERS_ACTION_ID, {
        tenantId: TENANT_A,
        roleIds: ["viewer"],
        ownersOnly: true,
      });
      expect(ownerEditors.total).to.equal(0);
    });

    it("pages stably and clamps the page size", async () => {
      const first = await runAction(LIST_MEMBERS_ACTION_ID, {
        tenantId: TENANT_A,
        limit: 2,
      });
      const second = await runAction(LIST_MEMBERS_ACTION_ID, {
        tenantId: TENANT_A,
        limit: 2,
        offset: 2,
      });
      expect(first).to.deep.include({ total: 3, hasMore: true });
      expect(second).to.deep.include({ total: 3, hasMore: false });
      expect(objectsOf(second.members)).to.have.length(1);
      const clamped = await runAction(LIST_MEMBERS_ACTION_ID, {
        tenantId: TENANT_A,
        limit: 0,
      });
      expect(objectsOf(clamped.members)).to.have.length(1);
    });

    it("fails the step for an unknown tenant", async () => {
      try {
        await runAction(LIST_MEMBERS_ACTION_ID, { tenantId: "nowhere" });
        expect.fail("expected a refusal");
      } catch (error) {
        expect(String(error)).to.contain(
          'dms.list-members: unknown tenant "nowhere"',
        );
      }
    });
  });
}

function registerGetTenantCases(ids: () => Seeded): void {
  describe("dms.get-tenant", () => {
    it("reads the name, member count and owners oldest first", async () => {
      await addMember(TENANT_A, ids().bob, {
        isTenantOwner: true,
        joinedAt: 500,
      });
      const output = await runAction(GET_TENANT_ACTION_ID, {
        tenantId: TENANT_A,
      });
      expect(output).to.deep.include({
        found: true,
        tenantId: TENANT_A,
        name: "Alpha",
        isDefault: false,
        memberCount: 4,
        ownerUserId: ids().bob,
        ownerUserIds: [ids().bob, ids().ada],
        closed: false,
        provisioningPending: false,
      });
    });

    it("answers found false for an unknown tenant and closed once deletion closed admission", async () => {
      expect(
        await runAction(GET_TENANT_ACTION_ID, { tenantId: "nowhere" }),
      ).to.deep.equal({ found: false });
      await closeTenantLifecycleAdmission(TENANT_B);
      expect(
        await runAction(GET_TENANT_ACTION_ID, { tenantId: TENANT_B }),
      ).to.deep.include({ found: true, closed: true });
    });
  });
}

describe("[integration] automation read actions", () => {
  let seeded: Seeded;

  beforeEach(async () => {
    await resetDatabase();
    await GetModel(TenantModel)
      .table.insert([
        { _id: TENANT_A, name: "Alpha" },
        { _id: TENANT_B, name: "Beta" },
      ])
      .run();
    const ada = await insertUser("ada@test.local", "Ada");
    const bob = await insertUser("bob@test.local", "Bob");
    const cleo = await insertUser("cleo@test.local", "Cleo");
    seeded = { ada, bob, cleo };
    await addMember(TENANT_A, ada, {
      roleIds: ["editor"],
      isTenantOwner: true,
      joinedAt: 2_000,
    });
    await addMember(TENANT_A, bob, { roleIds: ["viewer"], joinedAt: 1_000 });
    await addMember(TENANT_A, cleo, {
      roleIds: ["editor", "viewer"],
      joinedAt: 3_000,
    });
    await addMember(TENANT_B, bob, { isTenantOwner: true, joinedAt: 1_000 });
  });

  it("declares every read without side effects", () => {
    for (const id of [
      GET_USER_ACTION_ID,
      LIST_MEMBERS_ACTION_ID,
      GET_TENANT_ACTION_ID,
    ])
      expect(findAction(id).sideEffects, id).to.equal(false);
  });

  registerGetUserCases(() => seeded);
  registerListMembersCases(() => seeded);
  registerGetTenantCases(() => seeded);
});
