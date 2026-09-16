import { GetModel } from "@antelopejs/interface-database-decorators";
import { InviteResolutionsModel } from "./db/models/inviteResolutions.model";
import type { InviteResolution } from "./db/tables/inviteResolutions.table";
import { UserInviteModel } from "./db/models/user_invites.model";
import { ExecuteHooks, Hook, type InviteHookPayload } from "./hooks";

function hookPayload(resolution: InviteResolution): InviteHookPayload {
  const replacement = resolution.replacement;
  if (!replacement) throw new Error("Replacement snapshot missing");
  return {
    tenantId: resolution.tenantId,
    email: replacement.email,
    asTenantOwner: replacement.asTenantOwner,
    roleIds: replacement.roles_ids,
    deliveryId: resolution._id,
  };
}

async function beginReplacement(resolution: InviteResolution): Promise<void> {
  const replacement = resolution.replacement;
  if (!replacement) return;
  const model = GetModel(InviteResolutionsModel, resolution.tenantId);
  await ExecuteHooks(Hook.INVITE_BEING_CREATED, hookPayload(resolution));
  if (
    !(await model.advanceMembership(resolution, "applying", "replacementPhase"))
  )
    return;
  const invites = GetModel(UserInviteModel, resolution.tenantId);
  try {
    await invites.insert(replacement);
  } catch (error) {
    const existing = await invites.get(replacement._id);
    if (existing?.token !== replacement.token) throw error;
  }
  const current = await model.get(resolution._id);
  if (!current) throw new Error("Invite decision disappeared");
  await model.advanceMembership(current, "applied", "replacementPhase");
}

async function reconcileReplacement(
  resolution: InviteResolution,
): Promise<void> {
  const replacement = resolution.replacement;
  if (!replacement) return;
  const existing = await GetModel(UserInviteModel, resolution.tenantId).get(
    replacement._id,
  );
  if (existing?.token !== replacement.token) {
    throw new Error(
      "Invite replacement is indeterminate; automatic recreation is refused",
    );
  }
  await GetModel(InviteResolutionsModel, resolution.tenantId).advanceMembership(
    resolution,
    "applied",
    "replacementPhase",
  );
}

/** Inserts a replacement incarnation once; retries never resurrect a later retired token. */
export async function ensureInviteReplacement(
  resolution: InviteResolution,
): Promise<void> {
  if (!resolution.replacement) return;
  const model = GetModel(InviteResolutionsModel, resolution.tenantId);
  let current = resolution;
  while (current.replacementPhase !== "applied") {
    const advance = {
      pending: beginReplacement,
      applying: reconcileReplacement,
    }[current.replacementPhase];
    await advance(current);
    const next = await model.get(current._id);
    if (!next) throw new Error("Invite decision disappeared");
    current = next;
  }
  await ExecuteHooks(Hook.INVITE_CREATED, {
    ...hookPayload(current),
    inviteId: resolution.replacement._id,
    token: resolution.replacement.token,
  });
}
