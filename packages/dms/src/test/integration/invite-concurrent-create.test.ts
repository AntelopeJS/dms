import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  Hook,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import {
  type CreateUserInviteTokenOptions,
  createUserInviteToken,
} from "@antelopejs/interface-dms/invites";
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

describe("[integration] four concurrent invitations of one email", () => {
  beforeEach(resetDatabase);

  it("keeps one pending invitation when a fourth caller replaces a fresh invite before it withdraws", async () => {
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
    const refusal = await createUserInviteToken({
      ...inviteOptions("member"),
      replacesInvite: fresh,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    await invites.delete(fresh._id);
    const rows = await invites.getAll();
    assert.deepEqual(
      rows.map((row) => row.token),
      [kept.token],
    );
    assert.ok(refusal instanceof HTTPResult, String(refusal));
    assert.equal(refusal.getStatus(), HTTP_CONFLICT);
  });
});
