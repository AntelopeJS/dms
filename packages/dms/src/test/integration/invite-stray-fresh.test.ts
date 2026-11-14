import { strict as assert } from "node:assert";
import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  type CreateUserInviteTokenOptions,
  createUserInviteToken,
} from "@antelopejs/interface-dms/invites";
import { resetDatabase } from "../helpers/db";
import { failFirstDelete, holdFirstFreshCaller } from "../helpers/invite-holds";
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

async function tokensOf(invites: UserInviteModel): Promise<string[]> {
  return (await invites.getAll()).map((row) => row.token);
}

describe("[integration] a fresh invite left beside the kept one", () => {
  beforeEach(resetDatabase);

  it("resends the kept invitation after a withdrawn fresh invite failed to be deleted", async () => {
    const { invites, keptInvite } = await withdrawalThatFailedToDelete();
    const resent = await resend(keptInvite);
    assert.deepEqual(await tokensOf(invites), [resent.token]);
  });

  it("invites the email again after a withdrawn fresh invite failed to be deleted", async () => {
    const { invites } = await withdrawalThatFailedToDelete();
    const invited = await createUserInviteToken(inviteOptions());
    assert.deepEqual(await tokensOf(invites), [invited.token]);
  });

  it("refuses a resend of the withdrawn fresh invite and removes it", async () => {
    const { invites, keptInvite, stray } = await withdrawalThatFailedToDelete();
    await refusal(resend(stray));
    assert.deepEqual(await tokensOf(invites), [keptInvite.token]);
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
