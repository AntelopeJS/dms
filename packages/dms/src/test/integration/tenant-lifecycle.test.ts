import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantLifecycleModel } from "@antelopejs/interface-dms/db/internal/tenantLifecycle.model";
import {
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import {
  Hook,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
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
import { resetDatabase } from "../helpers/db";
import { setMemberOwnership } from "../../pages/members";
import { registerTenantMembershipCases } from "./tenant-membership.cases";
import {
  TENANT,
  HTTP_PAYMENT_REQUIRED,
} from "../helpers/tenant-lifecycle-fixtures";

const OTHER_TENANT = "tenant-lifecycle-other";
const SHARED_LIFECYCLE_ID = "membership-and-invites";
const HTTP_CONFLICT = 409;

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
});

describe("Tenant lifecycle admission (MongoDB adapter), ownership and preparation", () => {
  beforeEach(resetDatabase);

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
});

describe("Tenant lifecycle admission (MongoDB adapter), isolation and arbitration", () => {
  beforeEach(resetDatabase);

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

  it("ignores a row whose id names no tenant (fails when the shared row of older releases is still read)", async () => {
    const model = GetModel(TenantLifecycleModel, TENANT);
    await model.insert({
      _id: SHARED_LIFECYCLE_ID,
      revision: "shared-closed",
      closed: true,
      activeAttemptIds: [],
    });
    await model.admit(TENANT, "attempt");
    const state = await model.state(TENANT);
    assert.equal(state._id, `${SHARED_LIFECYCLE_ID}:${TENANT}`);
    assert.deepEqual(state.activeAttemptIds, ["attempt"]);
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
});

registerTenantMembershipCases({ HTTP_PAYMENT_REQUIRED, HTTP_CONFLICT });
