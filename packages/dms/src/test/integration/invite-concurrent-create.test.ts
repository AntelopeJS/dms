import { strict as assert } from "node:assert";
import { IsHTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  Hook,
  type InviteDeletedHookPayload,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import {
  type CreateUserInviteTokenOptions,
  createUserInviteToken,
} from "@antelopejs/interface-dms/invites";
import {
  completeInviteResolution,
  decideInvite,
} from "@antelopejs/interface-dms/invite-resolution";
import { runCleanupUserInvites } from "../../crons";
import { resetDatabase } from "../helpers/db";
import { inviteFixture } from "../helpers/invite-resolution-fixtures";
import {
  failFirstDelete,
  holdFirstCall,
  holdFirstFreshCaller,
  holdFreshAfterRivalRead,
} from "../helpers/invite-holds";

const TENANT = "invite-concurrent-create-tenant";
const HTTP_CONFLICT = 409;
const CALLERS = 2;

function inviteOptions(roleId: string): CreateUserInviteTokenOptions {
  return {
    tenantId: TENANT,
    email: "Concurrent@Example.test",
    language: "en",
    roleIds: [roleId],
    asTenantOwner: false,
  };
}

/** Holds every caller at `INVITE_BEING_CREATED`, after its read and before its insert, until all arrive. */
function bothReadBeforeEitherInserts(): () => void {
  let arrived = 0;
  let release = () => {};
  const allArrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  const barrier = async () => {
    arrived += 1;
    if (arrived === CALLERS) release();
    await allArrived;
  };
  RegisterHook(Hook.INVITE_BEING_CREATED, barrier);
  return () => UnregisterHook(Hook.INVITE_BEING_CREATED, barrier);
}

describe("[integration] concurrent invitations of one email", () => {
  let unregisterBarrier: () => void;

  beforeEach(async () => {
    await resetDatabase();
    unregisterBarrier = bothReadBeforeEitherInserts();
  });

  afterEach(() => unregisterBarrier());

  it("keeps one pending invitation and hands its token to the caller that created it alone", async () => {
    const [first, second] = await Promise.all([
      createUserInviteToken(inviteOptions("member")),
      createUserInviteToken(inviteOptions("member")),
    ]);
    const rows = await GetModel(UserInviteModel, TENANT).getAll();
    assert.equal(rows.length, 1);
    assert.equal(first.inviteId, rows[0]?._id);
    assert.equal(second.inviteId, rows[0]?._id);
    const tokens = [first.token, second.token].filter((token) => token);
    assert.equal(tokens.length, 1);
    assert.equal(
      (await GetModel(UserInviteModel, TENANT).getByToken(tokens[0] ?? ""))
        ?._id,
      rows[0]?._id,
    );
  });

  it("keeps one pending invitation and refuses the invitation that lost with other content", async () => {
    const results = await Promise.allSettled([
      createUserInviteToken(inviteOptions("member")),
      createUserInviteToken(inviteOptions("admin")),
    ]);
    const rows = await GetModel(UserInviteModel, TENANT).getAll();
    assert.equal(rows.length, 1);
    const refusals = results.flatMap((result): unknown[] =>
      result.status === "rejected" ? [result.reason] : [],
    );
    assert.equal(refusals.length, 1);
    const refusal = refusals[0];
    assert.ok(IsHTTPResult(refusal), String(refusal));
    assert.equal(refusal.getStatus(), HTTP_CONFLICT);
  });
});

describe("[integration] three concurrent invitations of one email", () => {
  let gate: ReturnType<typeof holdFirstFreshCaller>;

  beforeEach(async () => {
    await resetDatabase();
    gate = holdFirstFreshCaller();
  });

  afterEach(() => gate.unregister());

  it("keeps one pending invitation when a fresh invite lands after a replacement", async () => {
    const late = createUserInviteToken(inviteOptions("member"));
    await gate.parked;
    await createUserInviteToken(inviteOptions("member"));
    const replacement = await createUserInviteToken(inviteOptions("member"));
    gate.release();
    const lateResult = await late;
    const rows = await GetModel(UserInviteModel, TENANT).getAll();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?._id, replacement.inviteId);
    assert.equal(lateResult.inviteId, replacement.inviteId);
  });
});

/** Creates and replaces an invite, then stores a stray fresh row beside the kept replacement. */
async function keptInviteWithStrayFresh() {
  const invites = GetModel(UserInviteModel, TENANT);
  await createUserInviteToken(inviteOptions("member"));
  const kept = await createUserInviteToken(inviteOptions("member"));
  const replacement = await invites.get(kept.inviteId);
  assert.ok(replacement);
  const fresh = Object.assign(inviteFixture(replacement), {
    _id: "fresh-invite-before-withdrawal",
    token: "fresh-invite-token",
    creationResolutionId: "",
  });
  await invites.insert(fresh);
  return { invites, kept, fresh };
}

async function assertReplacementRefused(fresh: UserInvite): Promise<void> {
  const refusal = await createUserInviteToken({
    ...inviteOptions("member"),
    replacesInvite: fresh,
  }).then(
    () => null,
    (error: unknown) => error,
  );
  assert.ok(IsHTTPResult(refusal), String(refusal));
  assert.equal(refusal.getStatus(), HTTP_CONFLICT);
}

describe("[integration] four concurrent invitations of one email", () => {
  beforeEach(resetDatabase);

  it("keeps one pending invitation when a fourth caller replaces a fresh invite before it withdraws", async () => {
    const { invites, kept, fresh } = await keptInviteWithStrayFresh();
    await assertReplacementRefused(fresh);
    await invites.delete(fresh._id);
    const rows = await invites.getAll();
    assert.deepEqual(
      rows.map((row) => row._id),
      [kept.inviteId],
    );
  });

  it("keeps one pending invitation when a fourth caller replaces a fresh invite after it withdrew", async () => {
    const { invites, kept, fresh } = await keptInviteWithStrayFresh();
    await invites.delete(fresh._id);
    await assertReplacementRefused(fresh);
    const rows = await invites.getAll();
    assert.deepEqual(
      rows.map((row) => row._id),
      [kept.inviteId],
    );
  });
});

async function retire(
  invite: UserInvite,
  reason: "cancelled" | "expired",
): Promise<void> {
  const resolution = await decideInvite({ tenantId: TENANT, invite, reason });
  await completeInviteResolution(resolution);
}

const holds: { restore: () => void }[] = [];

function restoreHolds(): void {
  for (const hold of holds.splice(0)) hold.restore();
}

async function freshHeldAfterRivalRead() {
  const held = await holdFreshAfterRivalRead(inviteOptions("member"));
  holds.push(held.rivalRead);
  return held;
}

/** Holds B after its rival read, then retires the invite B read as its rival. */
async function freshHeldAfterRivalRetired(reason: "cancelled" | "expired") {
  const held = await freshHeldAfterRivalRead();
  await retire(held.keptInvite, reason);
  return held;
}

describe("[integration] an invitation retired while a fresh invite withdraws", () => {
  let replacementGate: ReturnType<typeof holdFirstFreshCaller> | undefined;

  beforeEach(resetDatabase);

  afterEach(() => {
    restoreHolds();
    replacementGate?.unregister();
    replacementGate = undefined;
  });

  for (const reason of ["cancelled", "expired"] as const) {
    it(`keeps one pending invitation when the kept invite is ${reason} before the fresh one withdraws`, async () => {
      const { invites, fresh, rivalRead } =
        await freshHeldAfterRivalRetired(reason);
      const stray = await invites.getByEmail(inviteOptions("member").email);
      assert.ok(stray);
      replacementGate = holdFirstFreshCaller();
      const replacing = createUserInviteToken({
        ...inviteOptions("member"),
        replacesInvite: stray,
      });
      await replacementGate.parked;

      rivalRead.release();
      await fresh.catch(() => null);
      await createUserInviteToken(inviteOptions("member"));
      replacementGate.release();
      await replacing.catch(() => null);

      const rows = await invites.getAll();
      assert.equal(rows.length, 1, JSON.stringify(rows.map((row) => row._id)));
    });

    it(`hands the fresh caller a pending invitation when the kept invite is ${reason} before it withdraws`, async () => {
      const { invites, fresh, rivalRead } =
        await freshHeldAfterRivalRetired(reason);
      rivalRead.release();
      const invited = await fresh;
      const rows = await invites.getAll();
      assert.deepEqual(
        rows.map((row) => row._id),
        [invited.inviteId],
      );
    });
  }

  it("invites a caller that reads a fresh invite between its withdrawal decision and its deletion", async () => {
    const { invites, fresh, rivalRead } =
      await freshHeldAfterRivalRetired("cancelled");
    const deletion = holdFirstCall("delete");
    holds.push(deletion);
    rivalRead.release();
    await deletion.parked;

    const invited = await createUserInviteToken(inviteOptions("member"));
    deletion.release();
    await fresh.catch(() => null);

    const rows = await invites.getAll();
    assert.deepEqual(
      rows.map((row) => row._id),
      [invited.inviteId],
    );
  });
});

describe("[integration] withdrawal of a fresh invite that found a rival", () => {
  beforeEach(resetDatabase);

  afterEach(restoreHolds);

  it("hands the withdrawing caller a replacement still being inserted", async () => {
    const { invites, fresh, rivalRead } =
      await freshHeldAfterRivalRetired("cancelled");
    const stray = await invites.getByEmail(inviteOptions("member").email);
    assert.ok(stray);
    const insertion = holdFirstCall("insert");
    holds.push(insertion);
    const replacing = createUserInviteToken({
      ...inviteOptions("member"),
      replacesInvite: stray,
    });
    await insertion.parked;

    rivalRead.release();
    const withdrawn = await fresh;
    insertion.release();
    const replaced = await replacing;

    assert.deepEqual(withdrawn, { inviteId: replaced.inviteId });
    const rows = await invites.getAll();
    assert.deepEqual(
      rows.map((row) => row._id),
      [replaced.inviteId],
    );
  });

  it("reports no removal of a withdrawn invite when the cleanup cron overlaps its withdrawal", async () => {
    const { fresh, rivalRead } = await freshHeldAfterRivalRead();
    const deleted: string[] = [];
    const recordDeletion = (payload: InviteDeletedHookPayload) => {
      deleted.push(payload.inviteId);
    };
    RegisterHook(Hook.INVITE_DELETED, recordDeletion);
    holds.push({
      restore: () => UnregisterHook(Hook.INVITE_DELETED, recordDeletion),
    });
    const deletion = holdFirstCall("delete");
    holds.push(deletion);
    rivalRead.release();
    await deletion.parked;

    await runCleanupUserInvites();
    deletion.release();
    await fresh;

    assert.deepEqual(deleted, []);
  });

  it("removes an expired fresh invite whose withdrawal failed to delete it", async () => {
    const { invites, fresh, rivalRead, keptInvite } =
      await freshHeldAfterRivalRead();
    holds.push(failFirstDelete());
    rivalRead.release();
    await fresh.catch(() => null);
    const stray = (await invites.getAll()).find(
      (row) => row._id !== keptInvite._id,
    );
    assert.ok(stray);

    await invites.update(stray._id, { expiresAt: new Date(0) });
    await runCleanupUserInvites();

    const rows = await invites.getAll();
    assert.deepEqual(
      rows.map((row) => row._id),
      [keptInvite._id],
    );
  });
});
