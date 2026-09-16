import { isDeepStrictEqual } from "node:util";
import { assert } from "@antelopejs/interface-api-util";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  type InviteDecision,
  InviteResolutionsModel,
} from "./db/models/inviteResolutions.model";
import type { InviteResolution } from "./db/tables/inviteResolutions.table";
import { UserInviteModel } from "./db/models/user_invites.model";
import type { UserInvite } from "./db/tables/user_invites.table";
import { ExecuteHooks, Hook } from "./hooks";
import {
  DeliverInviteExtensions,
  listInviteExtensions,
} from "./invite-extensions";
import { ensureInviteMembership } from "./invite-membership";
import { ensureInviteReplacement } from "./invite-replacement";
import { runTenantLifecycleOperation } from "./tenant-lifecycle";

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
      invite.skipEmailValidation,
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

function requireExtensions(resolution: InviteResolution): void {
  const available = new Set(
    listInviteExtensions().map((extension) => extension.key),
  );
  const missing = resolution.extensionKeys.filter((key) => !available.has(key));
  if (missing.length)
    throw new Error(`Invite delivery awaits extensions: ${missing.join(", ")}`);
}

async function deliverAcceptance(resolution: InviteResolution): Promise<void> {
  const member = await ensureInviteMembership(resolution);
  await DeliverInviteExtensions(
    resolution.invite.extensions,
    member,
    {
      tenantId: resolution.tenantId,
      email: resolution.invite.email,
      inviteId: resolution.invite._id,
      deliveryId: resolution._id,
    },
    { retryOnFailure: true },
  );
}

/** Replays durable effects. Contributor callbacks must deduplicate by deliveryId; failures retain the snapshot. */
export async function completeInviteResolution(
  resolution: InviteResolution,
): Promise<void> {
  await runTenantLifecycleOperation(resolution.tenantId, () =>
    completeAdmittedInviteResolution(resolution),
  );
}

/** @internal Completes within the caller's admission, including after admission closes. */
export async function completeAdmittedInviteResolution(
  resolution: InviteResolution,
): Promise<void> {
  const model = GetModel(InviteResolutionsModel, resolution.tenantId);
  const current = await model.get(resolution._id);
  if (!current) throw new Error("Invite decision disappeared");
  if (current.completed) return;
  requireExtensions(current);
  if (current.reason === "accepted") await deliverAcceptance(current);
  await ExecuteHooks(Hook.INVITE_DELETED, {
    tenantId: current.tenantId,
    inviteId: current.invite._id,
    email: current.invite.email,
    reason: current.reason,
    extensions: current.invite.extensions,
    deliveryId: current._id,
  });
  await ensureInviteReplacement(current);
  await GetModel(UserInviteModel, current.tenantId).delete(current.invite._id);
  await model.update(current._id, { completed: true });
}
