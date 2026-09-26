import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantLifecycleModel } from "@antelopejs/interface-dms/db/models/tenantLifecycle.model";
import {
  TenantMemberModel,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import {
  ExecuteHooks,
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
  runTenantLifecycleOperation,
} from "@antelopejs/interface-dms/tenant-lifecycle";
import { applyTenantOwnership } from "@antelopejs/interface-dms/tenant-ownership";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { resetDatabase } from "../helpers/db";

const TENANT = "tenant-lifecycle-test";
const OTHER_TENANT = "tenant-lifecycle-other";
const LEGACY_LIFECYCLE_ID = "membership-and-invites";
const HTTP_PAYMENT_REQUIRED = 402;
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
    skipEmailValidation: false,
  });
  assert.ok(
    await GetModel(TenantMemberModel, tenantId).getByUser("shared-member"),
  );
  assert.equal((await GetModel(UserInviteModel, tenantId).getAll()).length, 1);
}

describe("Tenant lifecycle admission (MongoDB adapter)", () => {
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

  // A hook refusing an invitation (a seat limit, say) used to leave its
  // admission behind for good, and the workspace could never be hard-deleted.
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
        skipEmailValidation: false,
      }).catch((error: unknown) => {
        refusal = error;
      });
    } finally {
      UnregisterHook(Hook.INVITE_BEING_CREATED, refuse);
    }
    assert.equal(
      (refusal as HTTPResult | undefined)?.getStatus(),
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
          skipEmailValidation: false,
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
      skipEmailValidation: false,
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
