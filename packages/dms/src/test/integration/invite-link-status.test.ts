import { HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { expect } from "chai";
import { type UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
import {
  completeInviteResolution,
  decideInvite,
} from "@antelopejs/interface-dms/invite-resolution";
import type { InviteResolutionReason } from "@antelopejs/interface-dms/db/tables/inviteResolutions.table";
import { createUserInviteToken } from "@antelopejs/interface-dms/invites";
import { validateInviteToken } from "../../routes/auth/validate-invite-token";
import { resetDatabase } from "../helpers/db";

const TENANT = "invite-link-status-tenant";
const INVITE_ID = "invite-link-status-invite";
const TOKEN = "invite-link-status-token";
const EMAIL = "invitee@example.test";
const OTHER_EMAIL = "someone-else@example.test";
const UNKNOWN_TOKEN = "invite-link-status-unknown";
const USER = "invite-link-status-user";
const FUTURE_MS = 60_000;
const HTTP_BAD_REQUEST = 400;

async function seedInvite(expiresAt: Date): Promise<UserInvite> {
  const invites = GetModel(UserInviteModel, TENANT);
  await invites.insert({
    _id: INVITE_ID,
    token: TOKEN,
    email: EMAIL,
    firstname: null,
    lastname: null,
    language: "en",
    roles_ids: [],
    asTenantOwner: false,
    expiresAt,
    extensions: null,
  });
  const invite = await invites.get(INVITE_ID);
  expect(invite).to.not.equal(undefined);
  return invite as UserInvite;
}

async function retire(
  invite: UserInvite,
  reason: InviteResolutionReason,
  userId?: string,
): Promise<void> {
  const resolution = await decideInvite({
    tenantId: TENANT,
    invite,
    reason,
    userId,
  });
  await completeInviteResolution(resolution);
}

/** The refusal the signup page reads when it opens on this link. */
async function refusalOf(token: string, email: string): Promise<unknown> {
  try {
    await validateInviteToken({ token, email });
  } catch (error) {
    expect(error).to.be.instanceOf(HTTPResult);
    expect((error as HTTPResult).getStatus()).to.equal(HTTP_BAD_REQUEST);
    return (error as HTTPResult).getBody();
  }
  return undefined;
}

describe("[integration] auth/validate-invite-token", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("accepts a pending invitation", async () => {
    await seedInvite(new Date(Date.now() + FUTURE_MS));
    expect(await refusalOf(TOKEN, EMAIL)).to.equal(undefined);
  });

  it("says a pending invitation past its date has expired", async () => {
    await seedInvite(new Date(0));
    expect(await refusalOf(TOKEN, EMAIL)).to.equal("error.invite_expired");
  });

  it("says a revoked invitation was revoked", async () => {
    const invite = await seedInvite(new Date(Date.now() + FUTURE_MS));
    await retire(invite, "cancelled");
    expect(await refusalOf(TOKEN, EMAIL)).to.equal("error.invite_revoked");
  });

  it("says a resent invitation was replaced by a newer email", async () => {
    const invite = await seedInvite(new Date(Date.now() + FUTURE_MS));
    const { token } = await createUserInviteToken({
      tenantId: TENANT,
      email: EMAIL,
      language: "en",
      roleIds: [],
      asTenantOwner: false,
      replacesInvite: invite,
      replacementReason: "resent",
    });

    expect(await refusalOf(TOKEN, EMAIL)).to.equal("error.invite_replaced");
    expect(await refusalOf(token, EMAIL)).to.equal(undefined);
  });

  it("says an invitation the cleanup expired has expired", async () => {
    const invite = await seedInvite(new Date(0));
    await retire(invite, "expired");
    expect(await refusalOf(TOKEN, EMAIL)).to.equal("error.invite_expired");
  });

  it("says an accepted invitation was already used", async () => {
    const invite = await seedInvite(new Date(Date.now() + FUTURE_MS));
    await retire(invite, "accepted", USER);
    expect(await refusalOf(TOKEN, EMAIL)).to.equal("error.invite_used");
  });

  // The reason belongs to whoever holds both halves of the link: a token
  // paired with another address reads exactly like one that never existed.
  it("tells nothing about a retired invitation to another address", async () => {
    const invite = await seedInvite(new Date(Date.now() + FUTURE_MS));
    await retire(invite, "cancelled");
    expect(await refusalOf(TOKEN, OTHER_EMAIL)).to.equal("error.invalid_token");
    expect(await refusalOf(UNKNOWN_TOKEN, EMAIL)).to.equal(
      "error.invalid_token",
    );
  });

  it("refuses a pending invitation claimed for another address", async () => {
    await seedInvite(new Date(Date.now() + FUTURE_MS));
    expect(await refusalOf(TOKEN, OTHER_EMAIL)).to.equal("error.invalid_token");
  });
});
