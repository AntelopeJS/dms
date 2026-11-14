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
