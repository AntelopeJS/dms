import { strict as assert } from "node:assert";
import type { UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  type CreateUserInviteTokenOptions,
  createUserInviteToken,
} from "@antelopejs/interface-dms/invites";
import { decideInvite } from "@antelopejs/interface-dms/invite-resolution";
import { resetDatabase } from "../helpers/db";
import {
  holdAfterFirstSettle,
  holdDeletionOf,
  holdFirstCall,
  holdFirstRivalRead,
  holdTwoFreshCallersBesideKept,
} from "../helpers/invite-holds";

const TENANT = "invite-fresh-adoption-tenant";

function inviteOptions(): CreateUserInviteTokenOptions {
  return {
    tenantId: TENANT,
    email: "Adoption@Example.test",
    language: "en",
    roleIds: ["member"],
    asTenantOwner: false,
  };
}

const holds: { restore: () => void }[] = [];

function held<T extends { restore: () => void }>(hold: T): T {
  holds.push(hold);
  return hold;
}

async function idsOf(invites: UserInviteModel): Promise<string[]> {
  return (await invites.getAll()).map((row) => row._id);
}

/**
 * Releases the first caller, holds it at its re-read of the kept invite, and
 * decides the kept invite's cancellation without completing it.
 */
async function firstWithdrawsAndKeptIsCancelled(
  setup: Awaited<ReturnType<typeof holdTwoFreshCallersBesideKept>>,
) {
  const reread = held(holdFirstCall("get"));
  setup.first.release();
  await reread.parked;
  await decideInvite({
    tenantId: TENANT,
    invite: setup.keptInvite,
    reason: "cancelled",
  });
  return reread;
}

describe("[integration] two fresh invites of one email around a retiring rival", () => {
  beforeEach(resetDatabase);

  afterEach(() => {
    for (const hold of holds.splice(0)) hold.restore();
  });

  it("hands two fresh callers one invitation when the kept invite's cancellation completes between their withdrawals", async () => {
    const setup = await holdTwoFreshCallersBesideKept(inviteOptions());
    const reread = await firstWithdrawsAndKeptIsCancelled(setup);
    const secondRivalRead = held(holdFirstRivalRead());
    setup.second.release();
    await secondRivalRead.parked;

    reread.release();
    const firstResult = await setup.firstCall;
    secondRivalRead.release();
    const secondResult = await setup.secondCall;
    assert.equal(firstResult.inviteId, secondResult.inviteId);
    assert.deepEqual(await idsOf(setup.invites), [secondResult.inviteId]);
  });

  it("hands the second caller the replacement decided on its fresh invite after the first caller kept it", async () => {
    const setup = await holdTwoFreshCallersBesideKept(inviteOptions());
    const reread = await firstWithdrawsAndKeptIsCancelled(setup);
    const secondRivalRead = held(holdFirstRivalRead());
    setup.second.release();
    await secondRivalRead.parked;
    reread.release();
    const firstResult = await setup.firstCall;

    const deletion = held(holdDeletionOf(firstResult.inviteId));
    const replacing = createUserInviteToken(inviteOptions());
    await deletion.parked;
    secondRivalRead.release();
    const secondResult = await setup.secondCall;
    deletion.release();
    const replaced = await replacing;
    assert.deepEqual(secondResult, { inviteId: replaced.inviteId });
    assert.deepEqual(await idsOf(setup.invites), [replaced.inviteId]);
  });

  it("hands both callers one invitation when the first finishes the second's withdrawal", async () => {
    const setup = await holdTwoFreshCallersBesideKept(inviteOptions());
    const reread = await firstWithdrawsAndKeptIsCancelled(setup);
    const settled = held(holdAfterFirstSettle());
    setup.second.release();
    await settled.parked;

    reread.release();
    const firstResult = await setup.firstCall;
    settled.release();
    const secondResult = await setup.secondCall;
    assert.equal(firstResult.inviteId, secondResult.inviteId);
    assert.deepEqual(await idsOf(setup.invites), [secondResult.inviteId]);
  });

  it("hands the first caller the resent invitation beside the second's fresh invite", async () => {
    const setup = await holdTwoFreshCallersBesideKept(inviteOptions());
    const reread = held(holdFirstCall("get"));
    setup.first.release();
    await reread.parked;
    const deletion = held(holdDeletionOf(setup.keptInvite._id));
    const resending = createUserInviteToken({
      ...inviteOptions(),
      replacesInvite: setup.keptInvite,
      replacementReason: "resent",
    });
    await deletion.parked;
    const secondRivalRead = held(holdFirstRivalRead());
    setup.second.release();
    await secondRivalRead.parked;
    deletion.release();
    const resent = await resending;

    reread.release();
    const firstResult = await setup.firstCall;
    secondRivalRead.release();
    const secondResult = await setup.secondCall;
    assert.equal(firstResult.inviteId, resent.inviteId);
    assert.deepEqual(secondResult, { inviteId: resent.inviteId });
    assert.deepEqual(await idsOf(setup.invites), [resent.inviteId]);
  });

  it("hands a caller that lost the fresh slot the resent invitation its winner withdraws to", async () => {
    const setup = await holdTwoFreshCallersBesideKept(inviteOptions());
    const deletion = held(holdDeletionOf(setup.keptInvite._id));
    const resending = createUserInviteToken({
      ...inviteOptions(),
      replacesInvite: setup.keptInvite,
      replacementReason: "resent",
    });
    await deletion.parked;
    const rivalRead = held(holdFirstRivalRead());
    setup.first.release();
    await rivalRead.parked;
    deletion.release();
    const resent = await resending;

    setup.second.release();
    const loserResult = await setup.secondCall;
    rivalRead.release();
    const winnerResult = await setup.firstCall;
    assert.deepEqual(winnerResult, { inviteId: resent.inviteId });
    assert.deepEqual(loserResult, { inviteId: resent.inviteId });
  });
});
