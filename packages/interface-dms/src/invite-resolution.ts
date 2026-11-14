import { HTTPResult } from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { InviteDecision } from "./db/models/inviteResolutions.model";
import { InviteResolutionsModel } from "./db/internal/inviteResolutions.model";
import type { InviteResolution } from "./db/tables/inviteResolutions.table";
import { UserInviteModel } from "./db/models/user_invites.model";
import type { UserInvite } from "./db/tables/user_invites.table";
import { listInviteExtensions } from "./invite-extensions/internal/registry";
import { changeTenantMembers } from "./tenant-members";
import { completeAdmittedInviteResolution } from "./internal/invite-resolution";
import { describeInviteMembership } from "./internal/invite-membership";
import { isSameInviteContent } from "./internal/invite-content";

const HTTP_CONFLICT = 409;
export type ResolveInviteInput = Omit<InviteDecision, "extensionKeys">;

/** Loads the exact incarnation or its durable snapshot so failed actions can resume. */
export async function loadInviteForAction(
  tenantId: string,
  inviteId: string,
): Promise<UserInvite | undefined> {
  const invite = await GetModel(UserInviteModel, tenantId).get(inviteId);
  if (invite) return invite;
  const resolution = await GetModel(
    InviteResolutionsModel,
    tenantId,
  ).getForInvite(tenantId, inviteId);
  return resolution?.invite;
}

/** Rejects actions on a replacement until its creating hooks complete. */
export async function assertInviteReady(
  tenantId: string,
  invite: UserInvite,
): Promise<void> {
  if (!invite.creationResolutionId) return;
  const parent = await GetModel(InviteResolutionsModel, tenantId).get(
    invite.creationResolutionId,
  );
  assert(
    parent?.completed,
    HTTP_CONFLICT,
    "Invitation creation is still pending",
  );
}

function assertSameDecision(
  resolution: InviteResolution,
  input: ResolveInviteInput,
): void {
  assert(
    resolution.reason === input.reason &&
      resolution.userId === (input.userId ?? null),
    HTTP_CONFLICT,
    "Invitation already has a different terminal decision",
  );
  assert(
    isSameInviteContent(resolution.replacement, input.replacement),
    HTTP_CONFLICT,
    "Invitation already has a different replacement",
  );
}

async function assertOnlyInviteOfEmail(
  tenantId: string,
  invite: UserInvite,
): Promise<void> {
  const invites = GetModel(UserInviteModel, tenantId);
  if (await invites.isOnlyInviteOfEmail(invite)) return;
  const stored = await invites.listByEmail(invite.email);
  const other = stored.some((row) => row._id === invite._id)
    ? stored.find((row) => row._id !== invite._id)
    : undefined;
  throw new HTTPResult(
    HTTP_CONFLICT,
    other
      ? `Invitation for this email was created concurrently: cancel invitation ${other._id}, created ${other.createdAt.toISOString()}, first`
      : "Invitation for this email was created concurrently",
  );
}

/**
 * Chooses one permanent outcome; all competing lifecycle paths must use this before effects.
 * A new replacement is refused with HTTP 409 unless its invite is the only invite of its email,
 * so a fresh invite that lost a concurrent creation is withdrawn, never replaced. While the
 * invite is stored, the refusal names another invite of the email, whose cancellation lets
 * the replacement through.
 */
export async function decideInvite(
  input: ResolveInviteInput,
): Promise<InviteResolution> {
  await assertInviteReady(input.tenantId, input.invite);
  const model = GetModel(InviteResolutionsModel, input.tenantId);
  const existing = await model.getForInvite(input.tenantId, input.invite._id);
  assert(
    input.reason !== "accepted" ||
      existing ||
      new Date(input.invite.expiresAt) > new Date(),
    HTTP_CONFLICT,
    "Invitation expired before acceptance",
  );
  if (input.replacement && !existing)
    await assertOnlyInviteOfEmail(input.tenantId, input.invite);
  const extensionKeys = [
    ...new Set([
      ...Object.keys(input.invite.extensions ?? {}),
      ...listInviteExtensions().map((extension) => extension.key),
    ]),
  ];
  const resolution = await model.decide({ ...input, extensionKeys });
  assertSameDecision(resolution, input);
  return resolution;
}

/** Replays durable effects. Contributor callbacks must deduplicate by deliveryId; failures retain the snapshot. */
export async function completeInviteResolution(
  resolution: InviteResolution,
): Promise<void> {
  await changeTenantMembers(resolution.tenantId, async () => ({
    changes: await describeInviteMembership(resolution),
    write: () => completeAdmittedInviteResolution(resolution),
  }));
}
