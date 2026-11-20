import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
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
import {
  failFirstDelete,
  holdFirstFreshCaller,
  afterFirstEmailRead,
  beforeFirstOnlyInviteCheck,
  beforeSecondEmailList,
  beforeSecondOnlyInviteCheck,
  readFirstEmailAs,
} from "../helpers/invite-holds";
import { inviteFixture } from "../helpers/invite-resolution-fixtures";

const TENANT = "invite-stray-fresh-tenant";
const HTTP_CONFLICT = 409;

function inviteOptions(): CreateUserInviteTokenOptions {
  return {
    tenantId: TENANT,
    email: "Stray@Example.test",
    language: "en",
    roleIds: ["member"],
    asTenantOwner: false,
  };
}

function resend(invite: UserInvite) {
  return createUserInviteToken({
    ...inviteOptions(),
    replacesInvite: invite,
    replacementReason: "resent",
  });
}

async function refusal(creation: Promise<unknown>): Promise<HTTPResult> {
  const error = await creation.then(
    () => null,
    (reason: unknown) => reason,
  );
  assert.ok(error instanceof HTTPResult, String(error));
  assert.equal(error.getStatus(), HTTP_CONFLICT);
  return error;
}

/**
 * A fresh invite B finds the replacement C kept as its rival, records its
 * withdrawal and fails to delete its row: the row stays beside the kept invite.
 */
async function withdrawalThatFailedToDelete() {
  const invites = GetModel(UserInviteModel, TENANT);
  const firstRead = holdFirstFreshCaller();
  const fresh = createUserInviteToken(inviteOptions());
  await firstRead.parked;
  firstRead.unregister();
  await createUserInviteToken(inviteOptions());
  const kept = await createUserInviteToken(inviteOptions());
  const deletion = failFirstDelete();
  firstRead.release();
  await assert.rejects(fresh, /delete failed/);
  deletion.restore();
  const keptInvite = await invites.get(kept.inviteId);
  assert.ok(keptInvite);
  const stray = (await invites.getAll()).find(
    (row) => row._id !== keptInvite._id,
  );
  assert.ok(stray);
  return { invites, keptInvite, stray };
}

/** Stores a fresh row beside a kept replacement, as a creator that stopped before its withdrawal leaves it. */
async function undecidedStrayBesideKept() {
  const invites = GetModel(UserInviteModel, TENANT);
  await createUserInviteToken(inviteOptions());
  const kept = await createUserInviteToken(inviteOptions());
  const keptInvite = await invites.get(kept.inviteId);
  assert.ok(keptInvite);
  const stray = Object.assign(inviteFixture(keptInvite), {
    _id: "stray-fresh-invite",
    token: "stray-fresh-token",
    creationResolutionId: "",
  });
  await invites.insert(stray);
  return { invites, keptInvite, stray };
}

async function idsOf(invites: UserInviteModel): Promise<string[]> {
  return (await invites.getAll()).map((row) => row._id);
}

describe("[integration] a fresh invite left beside the kept one", () => {
  beforeEach(resetDatabase);

  it("resends the kept invitation after a withdrawn fresh invite failed to be deleted", async () => {
    const { invites, keptInvite } = await withdrawalThatFailedToDelete();
    const resent = await resend(keptInvite);
    assert.deepEqual(await idsOf(invites), [resent.inviteId]);
  });

  it("invites the email again after a withdrawn fresh invite failed to be deleted", async () => {
    const { invites } = await withdrawalThatFailedToDelete();
    const invited = await createUserInviteToken(inviteOptions());
    assert.deepEqual(await idsOf(invites), [invited.inviteId]);
  });

  it("refuses a resend of the withdrawn fresh invite and removes it", async () => {
    const { invites, keptInvite, stray } = await withdrawalThatFailedToDelete();
    await refusal(resend(stray));
    assert.deepEqual(await idsOf(invites), [keptInvite._id]);
  });

  it("names the undecided fresh invite that blocks a resend of the kept one", async () => {
    const { invites, keptInvite, stray } = await undecidedStrayBesideKept();
    const refused = await refusal(resend(keptInvite));
    assert.match(
      refused.getBody(),
      new RegExp(`cancel invitation ${stray._id}`),
    );
    assert.deepEqual(
      (await invites.getAll()).map((row) => row._id).sort(),
      [keptInvite._id, stray._id].sort(),
    );
  });
});

async function pendingInvite() {
  const invites = GetModel(UserInviteModel, TENANT);
  const { inviteId } = await createUserInviteToken(inviteOptions());
  const invite = await invites.get(inviteId);
  assert.ok(invite);
  return { invites, invite };
}

async function cancel(invite: UserInvite): Promise<void> {
  const resolution = await decideInvite({
    tenantId: TENANT,
    invite,
    reason: "cancelled",
  });
  await completeInviteResolution(resolution);
}

async function accept(invite: UserInvite): Promise<void> {
  const resolution = await decideInvite({
    tenantId: TENANT,
    invite,
    reason: "accepted",
    userId: "accepting-user",
  });
  await completeInviteResolution(resolution);
}

describe("[integration] an invitation retired while another creation reads it", () => {
  let hold: { restore: () => void } | undefined;

  beforeEach(resetDatabase);

  afterEach(() => hold?.restore());

  it("invites the email when the invite it read is cancelled before its decision", async () => {
    const { invites, invite } = await pendingInvite();
    hold = afterFirstEmailRead(() => cancel(invite));
    const invited = await createUserInviteToken(inviteOptions());
    assert.deepEqual(await idsOf(invites), [invited.inviteId]);
  });

  it("refuses a new invitation when the invite it read is accepted before its decision", async () => {
    const { invites, invite } = await pendingInvite();
    hold = afterFirstEmailRead(() => accept(invite));
    await refusal(createUserInviteToken(inviteOptions()));
    assert.deepEqual(await idsOf(invites), []);
  });

  it("refuses a new invitation when the kept invite it read beside a withdrawn fresh invite is accepted", async () => {
    const { invites, keptInvite } = await withdrawalThatFailedToDelete();
    hold = readFirstEmailAs(keptInvite, () => accept(keptInvite));
    await refusal(createUserInviteToken(inviteOptions()));
    assert.deepEqual(await idsOf(invites), []);
  });

  it("invites the email when the kept invite it read beside a withdrawn fresh invite is cancelled during the retry", async () => {
    const { invites, keptInvite } = await withdrawalThatFailedToDelete();
    const read = readFirstEmailAs(keptInvite, async () => {});
    const cancelled = beforeSecondOnlyInviteCheck(() => cancel(keptInvite));
    hold = {
      restore: () => {
        read.restore();
        cancelled.restore();
      },
    };
    const invited = await createUserInviteToken(inviteOptions());
    assert.deepEqual(await idsOf(invites), [invited.inviteId]);
  });

  it("invites the email when the cleanup removes the withdrawn fresh invite while the kept invite it read is cancelled", async () => {
    const { invites, keptInvite, stray } = await withdrawalThatFailedToDelete();
    await invites.update(stray._id, { expiresAt: new Date(0) });
    const read = readFirstEmailAs(keptInvite, async () => {});
    const raced = beforeSecondEmailList(async () => {
      await cancel(keptInvite);
      await runCleanupUserInvites();
    });
    hold = {
      restore: () => {
        read.restore();
        raced.restore();
      },
    };
    const invited = await createUserInviteToken(inviteOptions());
    assert.deepEqual(await idsOf(invites), [invited.inviteId]);
  });

  it("names no invite to cancel when the invite it resends was resent meanwhile", async () => {
    const { invites, invite } = await pendingInvite();
    let resentMeanwhile = "";
    hold = beforeFirstOnlyInviteCheck(async () => {
      resentMeanwhile = (await resend(invite)).inviteId;
    });
    const refused = await refusal(resend(invite));
    assert.doesNotMatch(refused.getBody(), /cancel invitation/);
    assert.deepEqual(await idsOf(invites), [resentMeanwhile]);
  });
});
