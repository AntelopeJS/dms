import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  Hook,
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
import { resetDatabase } from "../helpers/db";
import { inviteFixture } from "../helpers/invite-resolution-fixtures";

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

  it("keeps one pending invitation and hands both callers its token", async () => {
    const [first, second] = await Promise.all([
      createUserInviteToken(inviteOptions("member")),
      createUserInviteToken(inviteOptions("member")),
    ]);
    const rows = await GetModel(UserInviteModel, TENANT).getAll();
    assert.equal(rows.length, 1);
    assert.deepEqual(first, second);
    assert.equal(first.token, rows[0]?.token);
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
    assert.ok(refusal instanceof HTTPResult, String(refusal));
    assert.equal(refusal.getStatus(), HTTP_CONFLICT);
  });
});

/** Holds the first caller at `INVITE_BEING_CREATED`, after it read no invitation, until `release` runs. */
function holdFirstFreshCaller() {
  let held = false;
  let park = () => {};
  const parked = new Promise<void>((resolve) => {
    park = resolve;
  });
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const hold = async () => {
    if (held) return;
    held = true;
    park();
    await released;
  };
  RegisterHook(Hook.INVITE_BEING_CREATED, hold);
  return {
    parked,
    release,
    unregister: () => UnregisterHook(Hook.INVITE_BEING_CREATED, hold),
  };
}

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
    assert.equal(rows[0]?.token, replacement.token);
    assert.deepEqual(lateResult, replacement);
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
  assert.ok(refusal instanceof HTTPResult, String(refusal));
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
      rows.map((row) => row.token),
      [kept.token],
    );
  });

  it("keeps one pending invitation when a fourth caller replaces a fresh invite after it withdrew", async () => {
    const { invites, kept, fresh } = await keptInviteWithStrayFresh();
    await invites.delete(fresh._id);
    await assertReplacementRefused(fresh);
    const rows = await invites.getAll();
    assert.deepEqual(
      rows.map((row) => row.token),
      [kept.token],
    );
  });
});

/** A one-shot gate: `pass` parks its caller until `release` runs. */
function gate() {
  let park = () => {};
  const parked = new Promise<void>((resolve) => {
    park = resolve;
  });
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pass = async () => {
    park();
    await released;
  };
  return { parked, release, pass };
}

/** Holds the first `getOtherByEmail` call after it read its rival, until `release` runs. */
function holdFirstRivalRead() {
  const original = Object.getOwnPropertyDescriptor(
    UserInviteModel.prototype,
    "getOtherByEmail",
  );
  assert.ok(original);
  const restore = () => {
    Object.defineProperty(
      UserInviteModel.prototype,
      "getOtherByEmail",
      original,
    );
  };
  const { parked, release, pass } = gate();
  UserInviteModel.prototype.getOtherByEmail = async function (
    this: UserInviteModel,
    email: string,
    exceptId: string,
  ) {
    restore();
    const rival = await this.getOtherByEmail(email, exceptId);
    await pass();
    return rival;
  };
  return { parked, release, restore };
}

/** Holds the first invite `delete` call before it deletes, until `release` runs. */
function holdFirstDelete() {
  const restore = () => {
    Reflect.deleteProperty(UserInviteModel.prototype, "delete");
  };
  const { parked, release, pass } = gate();
  UserInviteModel.prototype.delete = async function (
    this: UserInviteModel,
    ...args: Parameters<UserInviteModel["delete"]>
  ) {
    restore();
    await pass();
    return this.delete(...args);
  };
  return { parked, release, restore };
}

async function retire(
  invite: UserInvite,
  reason: "cancelled" | "expired",
): Promise<void> {
  const resolution = await decideInvite({ tenantId: TENANT, invite, reason });
  await completeInviteResolution(resolution);
}

describe("[integration] an invitation retired while a fresh invite withdraws", () => {
  const holds: { restore: () => void }[] = [];
  let replacementGate: ReturnType<typeof holdFirstFreshCaller> | undefined;

  beforeEach(resetDatabase);

  afterEach(() => {
    for (const hold of holds.splice(0)) hold.restore();
    replacementGate?.unregister();
    replacementGate = undefined;
  });

  /** Runs A's creation and C's replacement, then B's fresh insert, holding B after it read C's invite as its rival. */
  async function freshHeldAfterRivalRead(reason: "cancelled" | "expired") {
    const invites = GetModel(UserInviteModel, TENANT);
    const firstRead = holdFirstFreshCaller();
    const fresh = createUserInviteToken(inviteOptions("member"));
    await firstRead.parked;
    firstRead.unregister();
    await createUserInviteToken(inviteOptions("member"));
    const kept = await createUserInviteToken(inviteOptions("member"));
    const rivalRead = holdFirstRivalRead();
    holds.push(rivalRead);
    firstRead.release();
    await rivalRead.parked;
    const keptInvite = await invites.get(kept.inviteId);
    assert.ok(keptInvite);
    await retire(keptInvite, reason);
    return { invites, fresh, rivalRead };
  }

  for (const reason of ["cancelled", "expired"] as const) {
    it(`keeps one pending invitation when the kept invite is ${reason} before the fresh one withdraws`, async () => {
      const { invites, fresh, rivalRead } =
        await freshHeldAfterRivalRead(reason);
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
  }

  it("invites a caller that reads a fresh invite between its withdrawal decision and its deletion", async () => {
    const { invites, fresh, rivalRead } =
      await freshHeldAfterRivalRead("cancelled");
    const deletion = holdFirstDelete();
    holds.push(deletion);
    rivalRead.release();
    await deletion.parked;

    const invited = await createUserInviteToken(inviteOptions("member"));
    deletion.release();
    await fresh.catch(() => null);

    const rows = await invites.getAll();
    assert.deepEqual(
      rows.map((row) => row.token),
      [invited.token],
    );
  });
});
