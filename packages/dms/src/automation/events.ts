import type { TriggerType } from "@antelopejs/interface-dms-automation";
import type {
  InviteDeletedReason,
  UserDeletionReason,
} from "@antelopejs/interface-dms/hooks";
import type { AutomationOriginFields } from "./origin";

export type MemberAddedEvent = {
  tenantId: string;
  userId: string;
  isTenantOwner: boolean;
  /** Stable invite delivery identity; this best-effort event can repeat. */
  deliveryId?: string;
  at: string;
};

export type MemberRemovedEvent = AutomationOriginFields & {
  tenantId: string;
  userIds: string[];
  at: string;
};

export type InviteCreatedEvent = {
  tenantId: string;
  inviteId: string;
  email: string;
  asTenantOwner: boolean;
  roleIds: string[];
  /** Stable replacement identity; this best-effort event can repeat. */
  deliveryId?: string;
  at: string;
};

export type UserRegisteredEvent = {
  tenantId: string;
  userId: string;
  email: string;
  name: string;
  at: string;
};

export type RecordMutationEvent = {
  /** Absent for a table of the schema every tenant shares. */
  tenantId?: string;
  /** Data controller location of the mutated table, e.g. "/api/tables/members". */
  location: string;
  ids: string[];
  deliveryId: string;
  actorId?: string;
  actorName?: string;
  at: string;
};

export type InviteResolvedEvent = AutomationOriginFields & {
  tenantId: string;
  inviteId: string;
  email: string;
  reason: InviteDeletedReason;
  /** The resolution's identity: a resumed resolution repeats it. */
  deliveryId: string;
  at: string;
};

/** The write site a member's roles or owner flag changed through. */
export type MemberChangeOrigin =
  | "member-edit"
  | "ownership"
  | "role-deleted"
  | "automation";

export type MemberRolesChangedEvent = AutomationOriginFields & {
  tenantId: string;
  userId: string;
  roleIds: string[];
  previousRoleIds: string[];
  addedRoleIds: string[];
  removedRoleIds: string[];
  isTenantOwner: boolean;
  previousIsTenantOwner: boolean;
  origin: MemberChangeOrigin;
  actorId?: string;
  deliveryId: string;
  at: string;
};

export type UserDeletedEvent = {
  userId: string;
  email: string;
  tenantIds: string[];
  reason: UserDeletionReason;
  deliveryId: string;
  at: string;
};

export type TenantCreatedEvent = {
  tenantId: string;
  name?: string;
  userId?: string;
  isDefault: boolean;
  deliveryId: string;
  at: string;
};

export type TenantDeletedEvent = {
  tenantId: string;
  name?: string;
  ownerUserId?: string;
  ownerUserIds: string[];
  ownerEmail?: string;
  operationId?: string;
  deliveryId: string;
  at: string;
};

interface AutomationEventPayloads {
  "dms.member-added": MemberAddedEvent;
  "dms.member-removed": MemberRemovedEvent;
  "dms.invite-created": InviteCreatedEvent;
  "dms.user-registered": UserRegisteredEvent;
  "dms.record-created": RecordMutationEvent;
  "dms.record-updated": RecordMutationEvent;
  "dms.record-deleted": RecordMutationEvent;
  "dms.invite-resolved": InviteResolvedEvent;
  "dms.member-roles-changed": MemberRolesChangedEvent;
  "dms.user-deleted": UserDeletedEvent;
  "dms.tenant-created": TenantCreatedEvent;
  "dms.tenant-deleted": TenantDeletedEvent;
}

export type AutomationEventName = keyof AutomationEventPayloads;

export type AutomationEventPayload<E extends AutomationEventName> =
  AutomationEventPayloads[E];

/** The events a record mutation fires, each carrying a RecordMutationEvent. */
export type RecordEventName =
  | "dms.record-created"
  | "dms.record-updated"
  | "dms.record-deleted";

export type AutomationEventListener = Parameters<TriggerType["activate"]>[1];

type AutomationEventListeners = {
  [E in AutomationEventName]: Set<
    (payload: AutomationEventPayloads[E]) => void
  >;
};

const eventListeners: AutomationEventListeners = {
  "dms.member-added": new Set(),
  "dms.member-removed": new Set(),
  "dms.invite-created": new Set(),
  "dms.user-registered": new Set(),
  "dms.record-created": new Set(),
  "dms.record-updated": new Set(),
  "dms.record-deleted": new Set(),
  "dms.invite-resolved": new Set(),
  "dms.member-roles-changed": new Set(),
  "dms.user-deleted": new Set(),
  "dms.tenant-created": new Set(),
  "dms.tenant-deleted": new Set(),
};

export function listenersFor<E extends AutomationEventName>(
  event: E,
): AutomationEventListeners[E] {
  return eventListeners[event];
}

/**
 * Broadcast a dms lifecycle event to the automation triggers listening for
 * it. No-ops when nothing listens and never throws, so emit call sites in
 * business flows are always safe.
 */
export function emitAutomationEvent<E extends AutomationEventName>(
  event: E,
  payload: AutomationEventPayloads[E],
): void {
  for (const listener of listenersFor(event)) {
    // oxfmt-ignore
    try {
      listener(payload);
    } catch {
    }
  }
}
