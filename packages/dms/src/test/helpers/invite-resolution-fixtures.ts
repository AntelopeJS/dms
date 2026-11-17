import type { listenersFor } from "../../automation";
import type { InviteResolution } from "@antelopejs/interface-dms/db/tables/inviteResolutions.table";
import type { UserInvite } from "@antelopejs/interface-dms/db";

export type ListenerPayload = Parameters<
  Parameters<ReturnType<typeof listenersFor>["add"]>[0]
>[0];

export function hasDeliveryId(
  value: ListenerPayload,
): value is ListenerPayload & { deliveryId: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "deliveryId" in value &&
    typeof value.deliveryId === "string"
  );
}

export function inviteFixture(source: UserInvite): UserInvite {
  return {
    _id: source._id,
    createdAt: source.createdAt,
    email: source.email,
    firstname: source.firstname,
    lastname: source.lastname,
    roles_ids: source.roles_ids,
    language: source.language,
    token: source.token,
    asTenantOwner: source.asTenantOwner,
    expiresAt: source.expiresAt,
    creationResolutionId: source.creationResolutionId,
    extensions: source.extensions,
  };
}

export function resolutionFixture(source: InviteResolution): InviteResolution {
  return {
    _id: source._id,
    tenantId: source.tenantId,
    reason: source.reason,
    userId: source.userId,
    invite: source.invite,
    replacement: source.replacement,
    extensionKeys: source.extensionKeys,
    revision: source.revision,
    membershipPhase: source.membershipPhase,
    replacementPhase: source.replacementPhase,
    completed: source.completed,
    decidedAt: source.decidedAt,
  };
}
