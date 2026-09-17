import { strict as assert } from "node:assert";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { z } from "zod";
import { listenersFor, type MemberAddedEvent } from "../../automation/events";
import { runCleanupUserInvites } from "../../crons/cleanup-user-invites";
import { InviteResolutionsModel } from "@antelopejs/interface-dms/db/models/inviteResolutions.model";
import type { InviteResolution } from "@antelopejs/interface-dms/db/tables/inviteResolutions.table";
import { registerInviteExtensionCleanup } from "../../hooks/invite-extensions";
import {
  TenantMemberModel,
  type UserInvite,
  UserInviteModel,
} from "@antelopejs/interface-dms/db";
import {
  ExecuteHooks,
  Hook,
  RegisterHook,
  type TenantDeletionContext,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import { internal as extensions } from "@antelopejs/interface-dms/invite-extensions/registry";
import {
  assertInviteReady,
  completeInviteResolution,
  decideInvite,
} from "@antelopejs/interface-dms/invite-resolution";
import { createUserInviteToken } from "@antelopejs/interface-dms/invites";
import { UserModel } from "@antelopejs/interface-dms/auth/db";
import { Form } from "@antelopejs/interface-dms/base/form";
import { consumeInvite } from "../../routes/auth/invite";
import { resetDatabase } from "../helpers/db";

const TENANT = "invite-resolution-tenant";

/** The shape the test's invite extension stores and expects back. */
interface InviteExtensionSlice {
  value: string;
}
const USER = "invite-resolution-user";
const FUTURE_MS = 60_000;
const CLEANUP_SCAN_TEST_TIMEOUT_MS = 10_000;

function inviteFixture(source: UserInvite): UserInvite {
  return {
    _id: source._id,
    createdAt: source.createdAt,
    email: source.email,
    firstname: source.firstname,
    lastname: source.lastname,
    roles_ids: source.roles_ids,
    language: source.language,
    token: source.token,
    asTenantOwner: source.asTenantOwner,
    expiresAt: source.expiresAt,
    creationResolutionId: source.creationResolutionId,
    skipEmailValidation: source.skipEmailValidation,
    extensions: source.extensions,
  };
}

function resolutionFixture(source: InviteResolution): InviteResolution {
  return {
    _id: source._id,
    tenantId: source.tenantId,
    reason: source.reason,
    userId: source.userId,
    invite: source.invite,
    replacement: source.replacement,
    extensionKeys: source.extensionKeys,
    revision: source.revision,
    membershipPhase: source.membershipPhase,
    replacementPhase: source.replacementPhase,
    completed: source.completed,
    decidedAt: source.decidedAt,
  };
}

describe("Invite terminal decisions (MongoDB adapter)", () => {
  let invites: UserInviteModel;
  let decisions: InviteResolutionsModel;
  let invite: UserInvite;
  let failCleanup: boolean;
  let failAccept: boolean;
  let cleaned: Set<string>;
  let accepted: Set<string>;

  beforeEach(async () => {
    await resetDatabase();
    extensions.clearInviteExtensions();
    registerInviteExtensionCleanup();
    failCleanup = false;
    failAccept = false;
    cleaned = new Set();
    accepted = new Set();
    extensions.applyInviteExtension({
      key: "test",
      component: Form({ fields: [] }),
      schema: z.object({ value: z.string() }),
      placement: { side: "end", order: 0 },
      onAccept: (_payload, _member, context) => {
        assert.ok(context.deliveryId);
        accepted.add(context.deliveryId);
        if (failAccept) throw new Error("accept effect acknowledgement lost");
      },
      onCleanup: (payload, context) => {
        // Field by field, not `deepEqual`: the payload reaches the extension as
        // a per-context view of the stored slice, which carries the same values
        // without being the same object.
        assert.equal(
          (payload as InviteExtensionSlice | undefined)?.value,
          "snapshot",
        );
        assert.equal(context.tenantId, TENANT);
        assert.ok(context.deliveryId);
        cleaned.add(context.deliveryId);
        if (failCleanup) throw new Error("cleanup effect acknowledgement lost");
      },
    });
    invites = GetModel(UserInviteModel, TENANT);
    decisions = GetModel(InviteResolutionsModel, TENANT);
    await invites.insert({
      _id: "original-invite",
      token: "original-token",
      email: "invite@example.test",
      firstname: null,
      lastname: null,
      language: "en",
      roles_ids: ["initial-role"],
      asTenantOwner: false,
      expiresAt: new Date(Date.now() + FUTURE_MS),
      skipEmailValidation: false,
      extensions: { test: { value: "snapshot" } },
    });
    const row = await invites.get("original-invite");
    assert.ok(row);
    invite = row;
  });

  afterEach(() => extensions.clearInviteExtensions());

  it("chooses one outcome under simultaneous acceptance and cancellation", async () => {
    const results = await Promise.allSettled([
      decideInvite({
        tenantId: TENANT,
        invite,
        reason: "accepted",
        userId: USER,
      }),
      decideInvite({ tenantId: TENANT, invite, reason: "cancelled" }),
    ]);
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const [resolution] = await decisions.getAll();
    assert.ok(resolution);
    await completeInviteResolution(resolution);
    assert.equal(accepted.size + cleaned.size, 1);
    assert.equal((await decisions.getAll()).length, 1);
    assert.equal(await invites.get(invite._id), undefined);
  });

  it("never grants membership after a cancellation won", async () => {
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "cancelled",
    });
    await completeInviteResolution(resolution);
    await assert.rejects(
      consumeInvite(GetModel(UserModel), USER, { tenantId: TENANT, invite }),
    );
    assert.equal(
      await GetModel(TenantMemberModel, TENANT).getByUser(USER),
      undefined,
    );
    assert.equal(accepted.size, 0);
  });

  it("retains failed expiry snapshots and replays concurrent cleanup without duplicate effects", async () => {
    await invites.update(invite._id, { expiresAt: new Date(0) });
    failCleanup = true;
    await runCleanupUserInvites();
    const [resolution] = await decisions.getAll();
    assert.equal(resolution.completed, false);
    assert.ok(await invites.get(invite._id));
    await invites.delete(invite._id);
    failCleanup = false;
    await Promise.all([runCleanupUserInvites(), runCleanupUserInvites()]);
    assert.equal((await decisions.get(resolution._id))?.completed, true);
    assert.equal(cleaned.size, 1);
    assert.equal(accepted.size, 0);
  });

  it("preserves an accepted decision when the invite later expires", async () => {
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "accepted",
      userId: USER,
    });
    await invites.update(invite._id, { expiresAt: new Date(0) });
    await runCleanupUserInvites();
    assert.equal((await decisions.get(resolution._id))?.reason, "accepted");
    assert.equal(cleaned.size, 0);
    assert.equal(accepted.size, 1);
  });

  it("preserves admin edits during a failed acceptance replay", async () => {
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "accepted",
      userId: USER,
    });
    failAccept = true;
    await assert.rejects(completeInviteResolution(resolution));
    const members = GetModel(TenantMemberModel, TENANT);
    const member = await members.getByUser(USER);
    assert.ok(member);
    await members.update(member._id, {
      roleIds: ["admin-edited"],
      isTenantOwner: true,
    });
    failAccept = false;
    await completeInviteResolution(resolution);
    const current = await members.get(member._id);
    assert.deepEqual(current?.roleIds, ["admin-edited"]);
    assert.equal(current?.isTenantOwner, true);
    assert.equal(accepted.size, 1);
  });

  it("does not recreate a membership removed after its applied receipt", async () => {
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "accepted",
      userId: USER,
    });
    failAccept = true;
    await assert.rejects(completeInviteResolution(resolution));
    const members = GetModel(TenantMemberModel, TENANT);
    const member = await members.getByUser(USER);
    assert.ok(member);
    await members.delete(member._id);
    failAccept = false;
    await assert.rejects(completeInviteResolution(resolution), /removed/);
    assert.equal(await members.getByUser(USER), undefined);
    assert.equal((await decisions.get(resolution._id))?.completed, false);
  });

  it("leaves an ambiguous membership attempt unresolved instead of guessing it never ran", async () => {
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "accepted",
      userId: USER,
    });
    assert.equal(
      await decisions.advanceMembership(resolution, "applying"),
      true,
    );
    await assert.rejects(completeInviteResolution(resolution), /indeterminate/);
    assert.equal(
      await GetModel(TenantMemberModel, TENANT).getByUser(USER),
      undefined,
    );
    assert.equal((await decisions.get(resolution._id))?.completed, false);
  });

  it("recovers an uncertain decision insert without deleting or replacing the winner", async () => {
    const insert = decisions.insert.bind(decisions);
    decisions.insert = async (...args) => {
      await insert(...args);
      throw new Error("lost acknowledgement");
    };
    try {
      const resolution = await decisions.decide({
        tenantId: TENANT,
        invite,
        reason: "cancelled",
        extensionKeys: ["test"],
      });
      assert.equal(resolution.reason, "cancelled");
      assert.equal((await decisions.getAll()).length, 1);
    } finally {
      decisions.insert = insert;
    }
  });

  it("keeps one replacement snapshot across failed hooks and refuses resurrection after cancellation", async () => {
    const failCreated = () => {
      throw new Error("creation hook failed");
    };
    RegisterHook(Hook.INVITE_CREATED, failCreated);
    const options = {
      tenantId: TENANT,
      email: invite.email,
      language: "en",
      roleIds: ["replacement-role"],
      asTenantOwner: false,
      skipEmailValidation: false,
      replacesInvite: invite,
      extensions: invite.extensions ?? undefined,
    };
    try {
      await assert.rejects(
        createUserInviteToken(options),
        /creation hook failed/,
      );
    } finally {
      UnregisterHook(Hook.INVITE_CREATED, failCreated);
    }
    const resolution = await decisions.getForInvite(TENANT, invite._id);
    assert.ok(resolution?.replacement);
    const replacement = await invites.get(resolution.replacement._id);
    assert.ok(replacement);
    await assert.rejects(assertInviteReady(TENANT, replacement));
    const result = await createUserInviteToken(options);
    assert.equal(result.token, replacement.token);
    assert.equal((await invites.getAll()).length, 1);
    const cancelled = await decideInvite({
      tenantId: TENANT,
      invite: replacement,
      reason: "cancelled",
    });
    await completeInviteResolution(cancelled);
    await completeInviteResolution(resolution);
    assert.equal(await invites.get(replacement._id), undefined);
  });

  it("retains work while a snapshot's extension is unavailable", async () => {
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "cancelled",
    });
    extensions.clearInviteExtensions();
    await assert.rejects(
      completeInviteResolution(resolution),
      /awaits extensions/,
    );
    assert.ok(await invites.get(invite._id));
    assert.equal((await decisions.get(resolution._id))?.completed, false);
  });

  it("keeps invalid stored extension payloads pending rather than acknowledging skipped effects", async () => {
    const invalidInvite = inviteFixture(invite);
    invalidInvite.extensions = { test: { value: 42 } };
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite: invalidInvite,
      reason: "cancelled",
    });
    await assert.rejects(
      completeInviteResolution(resolution),
      /cleanup failed/,
    );
    assert.equal(cleaned.size, 0);
    assert.ok(await invites.get(invite._id));
    assert.equal((await decisions.get(resolution._id))?.completed, false);
  });

  it("does not overwrite an existing member with the acceptance snapshot", async () => {
    const members = GetModel(TenantMemberModel, TENANT);
    await members.insert({
      _id: "existing-member",
      userId: USER,
      roleIds: ["existing-role"],
      isTenantOwner: true,
      joinedAt: new Date(),
      invitedBy: null,
    });
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "accepted",
      userId: USER,
    });
    await completeInviteResolution(resolution);
    const member = await members.get("existing-member");
    assert.deepEqual(member?.roleIds, ["existing-role"]);
    assert.equal(member?.isTenantOwner, true);
    assert.equal(accepted.size, 1);
  });

  it("concurrent acceptance attempts insert one membership and replay the same delivery", async () => {
    const resolution = await decideInvite({
      tenantId: TENANT,
      invite,
      reason: "accepted",
      userId: USER,
    });
    await Promise.allSettled([
      completeInviteResolution(resolution),
      completeInviteResolution(resolution),
    ]);
    await completeInviteResolution(resolution);
    const members = await GetModel(TenantMemberModel, TENANT).getAll();
    assert.equal(members.length, 1);
    assert.equal(members[0].inviteDeliveryId, resolution._id);
    assert.equal(accepted.size, 1);
    assert.equal((await decisions.get(resolution._id))?.completed, true);
  });

  it("keeps automation best-effort and exposes replay identity without promising deduplication", async () => {
    const observed: string[] = [];
    const listener = (payload: unknown) => {
      observed.push((payload as MemberAddedEvent).deliveryId ?? "missing");
      throw new Error("best-effort observer failed");
    };
    listenersFor("dms.member-added").add(listener);
    try {
      const resolution = await decideInvite({
        tenantId: TENANT,
        invite,
        reason: "accepted",
        userId: USER,
      });
      failAccept = true;
      await assert.rejects(completeInviteResolution(resolution));
      failAccept = false;
      await completeInviteResolution(resolution);
      assert.deepEqual(observed, [resolution._id, resolution._id]);
      assert.equal((await decisions.get(resolution._id))?.completed, true);
    } finally {
      listenersFor("dms.member-added").delete(listener);
    }
  });

  it("arbitrates replacement against acceptance and cancellation without cross-tenant conflict", async () => {
    const replacement = inviteFixture(invite);
    replacement._id = "successor";
    replacement.token = "successor-token";
    const inputs = [
      { tenantId: TENANT, invite, reason: "accepted" as const, userId: USER },
      { tenantId: TENANT, invite, reason: "cancelled" as const },
      {
        tenantId: TENANT,
        invite,
        reason: "replaced" as const,
        replacement,
      },
    ];
    const results = await Promise.allSettled(inputs.map(decideInvite));
    assert.equal(
      results.filter((result) => result.status === "fulfilled").length,
      1,
    );
    const otherTenant = "other-tenant";
    const other = await decideInvite({
      tenantId: otherTenant,
      invite,
      reason: "cancelled",
    });
    const [original] = await decisions.getAll();
    assert.notEqual(original._id, other._id);
    assert.equal(original.tenantId, TENANT);
    assert.equal(other.tenantId, otherTenant);
  });

  it("advances beyond a full page of permanently unavailable extensions", async function () {
    this.timeout(CLEANUP_SCAN_TEST_TIMEOUT_MS);
    const blockedCount = 500;
    const template = await decisions.decide({
      tenantId: TENANT,
      invite,
      reason: "cancelled",
      extensionKeys: [],
    });
    await decisions.delete(template._id);
    await decisions.insert(
      Array.from({ length: blockedCount }, (_, index) => {
        const blocked = resolutionFixture(template);
        blocked._id = `blocked-${String(index).padStart(4, "0")}`;
        blocked.extensionKeys = ["unavailable"];
        return blocked;
      }),
    );
    const replayable = resolutionFixture(template);
    replayable._id = "last-replayable";
    await decisions.insert(replayable);
    await runCleanupUserInvites();
    assert.equal((await decisions.get("last-replayable"))?.completed, true);
    assert.equal((await decisions.get("blocked-0000"))?.completed, false);
  });

  it("propagates tenant deletion failures with the same operation identity on retry", async () => {
    const operationId = "retention:tenant:subscription:instant";
    const seen: string[] = [];
    const handler = (_tenantId: string, context?: TenantDeletionContext) => {
      assert.ok(context);
      assert.equal(context?.operationId, operationId);
      seen.push(context.operationId);
      throw new Error("retry deletion");
    };
    RegisterHook(Hook.TENANT_DELETED, handler);
    try {
      await assert.rejects(
        ExecuteHooks(Hook.TENANT_DELETED, TENANT, { operationId }),
        /retry deletion/,
      );
      await assert.rejects(
        ExecuteHooks(Hook.TENANT_DELETED, TENANT, { operationId }),
        /retry deletion/,
      );
      assert.deepEqual(seen, [operationId, operationId]);
    } finally {
      UnregisterHook(Hook.TENANT_DELETED, handler);
    }
  });
});
