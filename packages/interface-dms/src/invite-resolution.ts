import { isDeepStrictEqual } from "node:util";
import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import type { InviteDecision } from "./db/models/inviteResolutions.model";
import { InviteResolutionsModel } from "./db/internal/inviteResolutions.model";
import type { InviteResolution } from "./db/tables/inviteResolutions.table";
import { UserInviteModel } from "./db/models/user_invites.model";
import type { UserInvite } from "./db/tables/user_invites.table";
import { listInviteExtensions } from "./invite-extensions/internal/registry";
import { runTenantLifecycleOperation } from "./tenant-lifecycle";
import { completeAdmittedInviteResolution } from "./internal/invite-resolution";

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

/**
 * The replacement's content as plain data.
 *
 * `roles_ids` and `extensions` reach this comparison as per-context views when
 * the caller lives in another module, and `isDeepStrictEqual` refuses two views
 * holding the same values — which would report a faithful retry as a conflict.
 */
function replacementContent(invite: UserInvite | null | undefined): unknown {
  if (!invite) return null;
  return JSON.parse(
    JSON.stringify([
      invite.email,
      invite.firstname,
      invite.lastname,
      invite.language,
      invite.roles_ids,
      invite.asTenantOwner,
      invite.extensions,
    ]),
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
    isDeepStrictEqual(
      replacementContent(resolution.replacement),
      replacementContent(input.replacement),
    ),
    HTTP_CONFLICT,
    "Invitation already has a different replacement",
  );
}

/** Chooses one permanent outcome; all competing lifecycle paths must use this before effects. */
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
  await runTenantLifecycleOperation(resolution.tenantId, () =>
    completeAdmittedInviteResolution(resolution),
  );
}
