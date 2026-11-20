import { strict as assert } from "node:assert";
import type { UserInviteModel } from "@antelopejs/interface-dms/db";
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
import {
  gate,
  holdFirstCall,
  holdFreshAfterRivalRead,
} from "../helpers/invite-holds";

const TENANT = "invite-fresh-withdrawal-tenant";

function inviteOptions(): CreateUserInviteTokenOptions {
  return {
    tenantId: TENANT,
    email: "Withdrawal@Example.test",
    language: "en",
    roleIds: ["member"],
    asTenantOwner: false,
  };
}

const holds: { restore: () => void }[] = [];

async function freshHeldAfterRivalRead() {
  const held = await holdFreshAfterRivalRead(inviteOptions());
  holds.push(held.rivalRead);
  return held;
}

async function idsOf(invites: UserInviteModel): Promise<string[]> {
  return (await invites.getAll()).map((row) => row._id);
}

describe("[integration] a fresh invite whose rival retires during its withdrawal", () => {
  beforeEach(resetDatabase);

  afterEach(() => {
    for (const hold of holds.splice(0)) hold.restore();
  });

  it("hands the fresh caller a pending invitation when the kept invite's cancellation completes after it withdraws", async () => {
    const { invites, fresh, rivalRead, keptInvite } =
      await freshHeldAfterRivalRead();
    const cancellation = await decideInvite({
      tenantId: TENANT,
      invite: keptInvite,
      reason: "cancelled",
    });
    rivalRead.release();
    const invited = await fresh;
    await completeInviteResolution(cancellation);
    assert.deepEqual(await idsOf(invites), [invited.inviteId]);
  });

  it("hands the fresh caller the kept invitation accepted during its withdrawal and leaves its acceptance to its decider", async () => {
    const { invites, fresh, rivalRead, keptInvite } =
      await freshHeldAfterRivalRead();
    const acceptance = await decideInvite({
      tenantId: TENANT,
      invite: keptInvite,
      reason: "accepted",
      userId: "accepting-user",
    });
    rivalRead.release();
    const yielded = await fresh;
    assert.equal(yielded.inviteId, keptInvite._id);
    assert.equal(yielded.token, undefined);
    assert.deepEqual(await idsOf(invites), [keptInvite._id]);
    await completeInviteResolution(acceptance);
    assert.deepEqual(await idsOf(invites), []);
  });

  it("hands the fresh caller the replacement when the kept invite is resent during its withdrawal", async () => {
    const { invites, fresh, rivalRead, keptInvite } =
      await freshHeldAfterRivalRead();
    const reread = holdFirstCall("get");
    holds.push(reread);
    rivalRead.release();
    await reread.parked;
    const deletion = gate();
    RegisterHook(Hook.INVITE_DELETED, deletion.pass);
    holds.push({
      restore: () => UnregisterHook(Hook.INVITE_DELETED, deletion.pass),
    });
    const resending = createUserInviteToken({
      ...inviteOptions(),
      replacesInvite: keptInvite,
      replacementReason: "resent",
    });
    await deletion.parked;

    reread.release();
    const invited = await fresh;
    deletion.release();
    const resent = await resending;
    assert.deepEqual(invited, { inviteId: resent.inviteId });
    assert.deepEqual(await idsOf(invites), [resent.inviteId]);
  });
});
