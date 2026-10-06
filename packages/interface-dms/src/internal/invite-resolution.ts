import { GetModel } from "@antelopejs/interface-database-decorators";
import { InviteResolutionsModel } from "../db/internal/inviteResolutions.model";
import type { InviteResolution } from "../db/tables/inviteResolutions.table";
import { UserInviteModel } from "../db/models/user_invites.model";
import { ExecuteHooks, Hook } from "../hooks";
import { listInviteExtensions } from "../invite-extensions";
import { DeliverInviteExtensions } from "../invite-extensions/delivery";
import { ensureInviteMembership } from "./invite-membership";
import { ensureInviteReplacement } from "./invite-replacement";

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
