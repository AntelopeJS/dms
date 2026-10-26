import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantLifecycleModel } from "@antelopejs/interface-dms/db/internal/tenantLifecycle.model";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  RoleModel,
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import {
  ExecuteHooks,
  Hook,
  type MemberChangeHookPayload,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import type { AxiosInstance } from "axios";
import {
  completeInviteResolution,
  decideInvite,
} from "@antelopejs/interface-dms/invite-resolution";
import { createUserInviteToken } from "@antelopejs/interface-dms/invites";
import {
  closeTenantLifecycleAdmission,
  observeTenantLifecycle,
  pauseTenantLifecycleAdmission,
  resumeTenantLifecycleAdmission,
  runTenantLifecycleOperation,
} from "@antelopejs/interface-dms/tenant-lifecycle";
import { applyTenantOwnership } from "@antelopejs/interface-dms/tenant-ownership";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import {
  authorizedClient,
  type RegisteredUser,
  registerUser,
} from "../helpers/auth";
import { resetDatabase } from "../helpers/db";
import { setMemberOwnership } from "../../pages/settings/users/member-management";

const TENANT = "tenant-lifecycle-test";
const OTHER_TENANT = "tenant-lifecycle-other";
const LEGACY_LIFECYCLE_ID = "membership-and-invites";
const HTTP_PAYMENT_REQUIRED = 402;
const HTTP_CONFLICT = 409;
const HTTP_INTERNAL_ERROR = 500;

async function createTenantProducers(tenantId: string): Promise<void> {
  await applyTenantOwnership(GetModel(UserModel), "shared-member", tenantId, {
    roleIds: [],
    isTenantOwner: false,
  });
  await createUserInviteToken({
    tenantId,
    email: "isolation@example.test",
    language: "en",
    roleIds: [],
    asTenantOwner: false,
  });
  assert.ok(
    await GetModel(TenantMemberModel, tenantId).getByUser("shared-member"),
  );
  assert.equal((await GetModel(UserInviteModel, tenantId).getAll()).length, 1);
}

describe("Tenant lifecycle admission (MongoDB adapter)", () => {
  beforeEach(resetDatabase);

  it("drains an old ownership writer before validating, refusing new policy reads", async () => {
    await applyTenantOwnership(GetModel(UserModel), "member", TENANT, {
      roleIds: [],
      isTenantOwner: false,
    });
    const member = await GetModel(TenantMemberModel, TENANT).getByUser(
      "member",
    );
    assert.ok(member);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const guard = async () => {
      entered.resolve();
      await release.promise;
    };
    RegisterHook(Hook.MEMBER_BEING_CHANGED, guard);
    const writer = setMemberOwnership(TENANT, member._id, true);
    try {
      await entered.promise;
      const before = await observeTenantLifecycle(TENANT);
      assert.equal(before.activeAttemptIds.length, 1);
      assert.equal(
        await pauseTenantLifecycleAdmission(TENANT, "prepare", before.revision),
        true,
      );
      let policyReads = 0;
      await assert.rejects(
        runTenantLifecycleOperation(TENANT, async () => {
          policyReads++;
        }),
        (error: HTTPResult) => error.getStatus() === HTTP_CONFLICT,
      );
      assert.equal(policyReads, 0);
      assert.deepEqual(
        (await observeTenantLifecycle(TENANT)).activeAttemptIds,
        before.activeAttemptIds,
      );
      release.resolve();
      await writer;
      const drained = await observeTenantLifecycle(TENANT);
      assert.equal(drained.barrierId, "prepare");
      assert.deepEqual(drained.activeAttemptIds, []);
      assert.equal(
        (await GetModel(TenantMemberModel, TENANT).get(member._id))
          ?.isTenantOwner,
        true,
      );
      assert.equal(
        await resumeTenantLifecycleAdmission(TENANT, "prepare"),
        true,
      );
    } finally {
      release.resolve();
      await writer;
      UnregisterHook(Hook.MEMBER_BEING_CHANGED, guard);
    }
  });

  it("revokes delayed acquisitions, rejects foreign release and never reopens deletion", async () => {
    const initial = await observeTenantLifecycle(TENANT);
    assert.equal(await resumeTenantLifecycleAdmission(TENANT, "aborted"), true);
    assert.equal(
      await pauseTenantLifecycleAdmission(TENANT, "aborted", initial.revision),
      false,
    );
    const next = await observeTenantLifecycle(TENANT);
    assert.equal(
      await pauseTenantLifecycleAdmission(TENANT, "current", next.revision),
      true,
    );
    assert.equal(
      await resumeTenantLifecycleAdmission(TENANT, "foreign"),
      false,
    );
    assert.equal((await observeTenantLifecycle(TENANT)).barrierId, "current");
    assert.equal(await resumeTenantLifecycleAdmission(TENANT, "current"), true);
    assert.equal(
      await pauseTenantLifecycleAdmission(TENANT, "current", next.revision),
      false,
    );
    await closeTenantLifecycleAdmission(TENANT);
    assert.equal(
      await resumeTenantLifecycleAdmission(TENANT, "current"),
      false,
    );
    const closed = await observeTenantLifecycle(TENANT);
    assert.equal(
      await pauseTenantLifecycleAdmission(TENANT, "late", closed.revision),
      false,
    );
    await assert.rejects(
      runTenantLifecycleOperation(TENANT, async () => undefined),
      /closed/,
    );
  });

  it("aborts preparation without retiring uncertain effects or freezing compatible work", async () => {
    await assert.rejects(
      runTenantLifecycleOperation(TENANT, async () => {
        throw new Error("uncertain write");
      }),
    );
    const before = await observeTenantLifecycle(TENANT);
    assert.equal(before.activeAttemptIds.length, 1);
    assert.equal(
      await pauseTenantLifecycleAdmission(TENANT, "prepare", before.revision),
      true,
    );
    assert.deepEqual(
      (await observeTenantLifecycle(TENANT)).activeAttemptIds,
      before.activeAttemptIds,
    );
    await resumeTenantLifecycleAdmission(TENANT, "prepare");
    await runTenantLifecycleOperation(TENANT, async () => undefined);
    assert.deepEqual(
      (await observeTenantLifecycle(TENANT)).activeAttemptIds,
      before.activeAttemptIds,
    );
  });

  it("vetoes ownership and invite acceptance before persistence, including delivery replay", async () => {
    await applyTenantOwnership(GetModel(UserModel), "member", TENANT, {
      roleIds: [],
      isTenantOwner: false,
    });
    const member = await GetModel(TenantMemberModel, TENANT).getByUser(
      "member",
    );
    assert.ok(member);
    const created = await createUserInviteToken({
      tenantId: TENANT,
      email: "veto@example.test",
      language: "en",
      roleIds: [],
      asTenantOwner: false,
    });
    const invite = await GetModel(UserInviteModel, TENANT).get(
      created.inviteId,
    );
    assert.ok(invite);
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "accepted",
      userId: "recipient",
    });
    const veto = () => {
      throw new HTTPResult(HTTP_PAYMENT_REQUIRED, "pending Free");
    };
    RegisterHook(Hook.MEMBER_BEING_CHANGED, veto);
    try {
      await assert.rejects(setMemberOwnership(TENANT, member._id, true));
      await assert.rejects(
        applyTenantOwnership(GetModel(UserModel), "member", TENANT, {
          roleIds: [],
          isTenantOwner: true,
        }),
      );
      await assert.rejects(completeInviteResolution(resolution));
      await assert.rejects(completeInviteResolution(resolution));
      assert.equal(
        (await GetModel(TenantMemberModel, TENANT).get(member._id))
          ?.isTenantOwner,
        false,
      );
      assert.equal(
        await GetModel(TenantMemberModel, TENANT).getByUser("recipient"),
        undefined,
      );
      assert.deepEqual(
        (await observeTenantLifecycle(TENANT)).activeAttemptIds,
        [],
      );
    } finally {
      UnregisterHook(Hook.MEMBER_BEING_CHANGED, veto);
    }
    await completeInviteResolution(resolution);
    assert.ok(await GetModel(TenantMemberModel, TENANT).getByUser("recipient"));
  });

  it("isolates membership, invites and closure across tenants", async () => {
    await createTenantProducers(TENANT);
    await createTenantProducers(OTHER_TENANT);
    const first = GetModel(TenantLifecycleModel, TENANT);
    const other = GetModel(TenantLifecycleModel, OTHER_TENANT);
    assert.equal(
      (await first.state(TENANT))._id,
      `membership-and-invites:${TENANT}`,
    );
    assert.equal(
      (await other.state(OTHER_TENANT))._id,
      `membership-and-invites:${OTHER_TENANT}`,
    );
    await closeTenantLifecycleAdmission(TENANT);
    await assert.rejects(first.admit(TENANT, "late"), /closed/);
    await runTenantLifecycleOperation(OTHER_TENANT, async () => {
      const state = await other.state(OTHER_TENANT);
      assert.equal(state.closed, false);
      assert.equal(state.activeAttemptIds.length, 1);
      assert.deepEqual((await first.state(TENANT)).activeAttemptIds, []);
    });
    assert.deepEqual((await other.state(OTHER_TENANT)).activeAttemptIds, []);
    await closeTenantLifecycleAdmission(OTHER_TENANT);
  });

  it("preserves a legacy closed row while a new tenant admits producers", async () => {
    const legacy = GetModel(TenantLifecycleModel, TENANT);
    await legacy.insert({
      _id: LEGACY_LIFECYCLE_ID,
      revision: "legacy-closed",
      closed: true,
      activeAttemptIds: ["retained-attempt"],
    });
    await createTenantProducers(OTHER_TENANT);
    await assert.rejects(legacy.admit(TENANT, "late"), /closed/);
    await assert.rejects(legacy.close(TENANT), /blocked/);
    await legacy.finish(TENANT, "retained-attempt");
    await legacy.close(TENANT);
    assert.equal((await legacy.state(TENANT))._id, LEGACY_LIFECYCLE_ID);
    assert.equal((await legacy.state(TENANT)).closed, true);
    assert.deepEqual((await legacy.state(TENANT)).activeAttemptIds, []);
    assert.equal((await legacy.getAll()).length, 1);
    assert.equal(
      (await GetModel(TenantLifecycleModel, OTHER_TENANT).state(OTHER_TENANT))
        .closed,
      false,
    );
  });

  it("continues legacy active attempts without creating a replacement row", async () => {
    const legacy = GetModel(TenantLifecycleModel, TENANT);
    await legacy.insert({
      _id: LEGACY_LIFECYCLE_ID,
      revision: "legacy-active",
      closed: false,
      activeAttemptIds: ["legacy-attempt"],
    });
    await createTenantProducers(OTHER_TENANT);
    await legacy.admit(TENANT, "new-attempt");
    await legacy.finish(TENANT, "legacy-attempt");
    assert.deepEqual((await legacy.state(TENANT)).activeAttemptIds, [
      "new-attempt",
    ]);
    await assert.rejects(legacy.close(TENANT), /blocked/);
    await legacy.finish(TENANT, "new-attempt");
    await legacy.close(TENANT);
    assert.equal((await legacy.state(TENANT))._id, LEGACY_LIFECYCLE_ID);
    assert.equal((await legacy.getAll()).length, 1);
    await assert.rejects(legacy.admit(TENANT, "late"), /closed/);
  });

  it("arbitrates simultaneous closure and admission on one revision", async () => {
    const model = GetModel(TenantLifecycleModel, TENANT);
    const [admission, closure] = await Promise.allSettled([
      model.admit(TENANT, "attempt"),
      model.close(TENANT),
    ]);
    const state = await model.state(TENANT);
    assert.equal(state.closed, true);
    assert.equal(
      admission.status === "fulfilled",
      state.activeAttemptIds.includes("attempt"),
    );
    assert.equal(
      closure.status === "fulfilled",
      state.activeAttemptIds.length === 0,
    );
    await assert.rejects(model.admit(TENANT, "late"), /closed/);
  });

  it("a paused admitted producer can finish after closure, before any destructive cleanup", async () => {
    const invites = GetModel(UserInviteModel, TENANT);
    await invites.table.insert({ _id: "retained-before-drain" }).run();
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const guard = async () => {
      entered.resolve();
      await resume.promise;
      return undefined;
    };
    RegisterHook(Hook.MEMBER_BEING_ADDED, guard);
    const producer = applyTenantOwnership(
      GetModel(UserModel),
      "member",
      TENANT,
      { roleIds: [], isTenantOwner: false },
    );
    try {
      await entered.promise;
      await assert.rejects(
        ExecuteHooks(Hook.TENANT_DELETED, TENANT),
        /blocked/,
      );
      assert.ok(await invites.get("retained-before-drain"));
      resume.resolve();
      await producer;
      assert.ok(await GetModel(TenantMemberModel, TENANT).getByUser("member"));
      await ExecuteHooks(Hook.TENANT_DELETED, TENANT);
      assert.equal(await invites.get("retained-before-drain"), undefined);
      assert.equal(
        await GetModel(TenantMemberModel, TENANT).getByUser("member"),
        undefined,
      );
      await assert.rejects(
        applyTenantOwnership(GetModel(UserModel), "late", TENANT, {
          roleIds: [],
          isTenantOwner: false,
        }),
        /closed/,
      );
    } finally {
      resume.resolve();
      await producer;
      UnregisterHook(Hook.MEMBER_BEING_ADDED, guard);
    }
  });

  it("one finishing attempt never drains another paused invocation", async () => {
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const paused = runTenantLifecycleOperation(TENANT, async () => {
      entered.resolve();
      await resume.promise;
    });
    await entered.promise;
    try {
      await runTenantLifecycleOperation(TENANT, async () => undefined);
      const state = await GetModel(TenantLifecycleModel, TENANT).state(TENANT);
      assert.equal(state.activeAttemptIds.length, 1);
      await assert.rejects(closeTenantLifecycleAdmission(TENANT), /blocked/);
    } finally {
      resume.resolve();
      await paused;
    }
    await closeTenantLifecycleAdmission(TENANT);
    await closeTenantLifecycleAdmission(TENANT);
  });

  it("retains failed invocations even when a separate replay succeeds", async () => {
    await assert.rejects(
      runTenantLifecycleOperation(TENANT, async () => {
        throw new Error("uncertain effect");
      }),
    );
    const model = GetModel(TenantLifecycleModel, TENANT);
    const failedAttempts = (await model.state(TENANT)).activeAttemptIds;
    await runTenantLifecycleOperation(TENANT, async () => undefined);
    assert.deepEqual(
      (await model.state(TENANT)).activeAttemptIds,
      failedAttempts,
    );
    await assert.rejects(closeTenantLifecycleAdmission(TENANT), /blocked/);
  });

  it("retains an invocation that failed with a server error", async () => {
    await assert.rejects(
      runTenantLifecycleOperation(TENANT, async () => {
        throw new HTTPResult(HTTP_INTERNAL_ERROR, "uncertain effect");
      }),
    );
    const model = GetModel(TenantLifecycleModel, TENANT);
    assert.equal((await model.state(TENANT)).activeAttemptIds.length, 1);
    await assert.rejects(closeTenantLifecycleAdmission(TENANT), /blocked/);
  });

  it("releases an invocation a hook refused before any effect", async () => {
    let refusal: unknown;
    const refuse = () => {
      throw new HTTPResult(HTTP_PAYMENT_REQUIRED, "seat limit reached");
    };
    RegisterHook(Hook.INVITE_BEING_CREATED, refuse);
    try {
      await createUserInviteToken({
        tenantId: TENANT,
        email: "refused@example.test",
        language: "en",
        roleIds: [],
        asTenantOwner: false,
      }).catch((error) => {
        refusal = error;
      });
    } finally {
      UnregisterHook(Hook.INVITE_BEING_CREATED, refuse);
    }
    assert.equal(
      refusal instanceof HTTPResult && refusal.getStatus(),
      HTTP_PAYMENT_REQUIRED,
    );
    const model = GetModel(TenantLifecycleModel, TENANT);
    assert.deepEqual((await model.state(TENANT)).activeAttemptIds, []);
    assert.equal((await GetModel(UserInviteModel, TENANT).getAll()).length, 0);
    await closeTenantLifecycleAdmission(TENANT);
  });

  it("retains a committed admission with an unknown acknowledgement without running effects", async () => {
    const model = GetModel(TenantLifecycleModel, TENANT);
    await model.state(TENANT);
    const table = model.table;
    const mutate = table.atomicMutation.bind(table);
    let effects = 0;
    table.atomicMutation = function (...args) {
      const query = mutate(...args);
      const run = query.run.bind(query);
      query.run = async () => {
        await run();
        return "unknown";
      };
      return query;
    };
    try {
      await assert.rejects(
        runTenantLifecycleOperation(TENANT, async () => {
          effects++;
        }),
        /indeterminate/,
      );
      assert.equal(effects, 0);
    } finally {
      table.atomicMutation = mutate;
    }
    assert.equal((await model.state(TENANT)).activeAttemptIds.length, 1);
    await assert.rejects(model.close(TENANT), /blocked/);
  });

  it("rejects fresh invites before creation hooks after permanent closure", async () => {
    await closeTenantLifecycleAdmission(TENANT);
    let effects = 0;
    const observe = () => {
      effects++;
      return undefined;
    };
    RegisterHook(Hook.INVITE_BEING_CREATED, observe);
    try {
      await assert.rejects(
        createUserInviteToken({
          tenantId: TENANT,
          email: "closed@example.test",
          language: "en",
          roleIds: [],
          asTenantOwner: false,
        }),
        /closed/,
      );
      assert.equal(effects, 0);
      assert.equal(
        (await GetModel(UserInviteModel, TENANT).getAll()).length,
        0,
      );
    } finally {
      UnregisterHook(Hook.INVITE_BEING_CREATED, observe);
    }
  });

  it("cannot replay a pending acceptance after hard-delete", async () => {
    const created = await createUserInviteToken({
      tenantId: TENANT,
      email: "pending@example.test",
      language: "en",
      roleIds: [],
      asTenantOwner: false,
    });
    const invite = await GetModel(UserInviteModel, TENANT).get(
      created.inviteId,
    );
    assert.ok(invite);
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "accepted",
      userId: "late-member",
    });
    await closeTenantLifecycleAdmission(TENANT);
    await ExecuteHooks(Hook.TENANT_DELETED, TENANT);
    await assert.rejects(completeInviteResolution(resolution), /closed/);
    assert.equal(
      await GetModel(TenantMemberModel, TENANT).getByUser("late-member"),
      undefined,
    );
  });
});

describe("Every membership write goes through changeTenantMembers", () => {
  const MEMBERS_API = "/api/tables/members";
  const ROLES_TABLE = "/api/tables/roles";
  const ACCOUNT_DELETION = "/dms/pages/settings/user/profile/account-deletion";
  const HTTP_OK = 200;
  let owner: AxiosInstance;
  let member: RegisteredUser;
  let memberRowId: string;
  let roleId: string;

  const editRoles = (roleIds: string[]) =>
    owner.put(
      `${MEMBERS_API}/edit`,
      { roleIds },
      { params: { id: memberRowId } },
    );
  const storedRoles = async () =>
    (await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).get(memberRowId))
      ?.roleIds;

  beforeEach(async () => {
    await resetDatabase();
    owner = authorizedClient((await registerUser({ owner: true })).accessToken);
    [roleId] = await GetModel(RoleModel, DEFAULT_TENANT_ID).insert({
      name: "Support",
      permissions: [],
    });
    member = await registerUser({ roles_ids: [roleId] });
    const row = await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).getByUser(
      member.userId,
    );
    assert.ok(row);
    memberRowId = row._id;
  });

  it("refuses role changes and an account deletion with 409 while a barrier is held, writing nothing", async () => {
    const { revision } = await observeTenantLifecycle(DEFAULT_TENANT_ID);
    assert.equal(
      await pauseTenantLifecycleAdmission(DEFAULT_TENANT_ID, "free", revision),
      true,
    );
    try {
      assert.equal((await editRoles([])).status, HTTP_CONFLICT);
      const roleDeleted = await owner.delete(`${ROLES_TABLE}/delete`, {
        params: { id: roleId },
        data: { reassignTo: null },
      });
      assert.equal(roleDeleted.status, HTTP_CONFLICT);
      assert.ok(await GetModel(RoleModel, DEFAULT_TENANT_ID).get(roleId));
      assert.deepEqual(await storedRoles(), [roleId]);

      const accountDeleted = await authorizedClient(member.accessToken).post(
        ACCOUNT_DELETION,
        { password: member.password, confirmation: member.email },
      );
      assert.equal(accountDeleted.status, HTTP_CONFLICT);
      assert.ok(await GetModel(UserModel).get(member.userId));
      assert.ok(
        await GetModel(TenantMemberModel, DEFAULT_TENANT_ID).get(memberRowId),
      );
      assert.deepEqual(
        (await observeTenantLifecycle(DEFAULT_TENANT_ID)).activeAttemptIds,
        [],
      );
    } finally {
      await resumeTenantLifecycleAdmission(DEFAULT_TENANT_ID, "free");
    }
    assert.equal((await editRoles([])).status, HTTP_OK);
    assert.deepEqual(await storedRoles(), []);
  });

  it("lets the policy hook veto a role change, announced as such", async () => {
    const announced: MemberChangeHookPayload[] = [];
    const veto = (payload: MemberChangeHookPayload) => {
      announced.push(payload);
      throw new HTTPResult(HTTP_PAYMENT_REQUIRED, "no role changes");
    };
    RegisterHook(Hook.MEMBER_BEING_CHANGED, veto);
    try {
      assert.equal((await editRoles([])).status, HTTP_PAYMENT_REQUIRED);
    } finally {
      UnregisterHook(Hook.MEMBER_BEING_CHANGED, veto);
    }
    assert.deepEqual(await storedRoles(), [roleId]);
    assert.deepEqual(JSON.parse(JSON.stringify(announced)), [
      {
        tenantId: DEFAULT_TENANT_ID,
        kind: "roles",
        userId: member.userId,
        roleIds: [],
        previousRoleIds: [roleId],
      },
    ]);
    assert.deepEqual(
      (await observeTenantLifecycle(DEFAULT_TENANT_ID)).activeAttemptIds,
      [],
    );
  });
});
