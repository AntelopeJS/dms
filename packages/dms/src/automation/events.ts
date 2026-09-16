export interface MemberAddedEvent {
  tenantId: string;
  userId: string;
  isTenantOwner: boolean;
  /** Stable invite delivery identity; this best-effort event can repeat. */
  deliveryId?: string;
  at: string;
}

export interface MemberRemovedEvent {
  tenantId: string;
  userIds: string[];
  at: string;
}

export interface InviteCreatedEvent {
  tenantId: string;
  inviteId: string;
  email: string;
  asTenantOwner: boolean;
  roleIds: string[];
  /** Stable replacement identity; this best-effort event can repeat. */
  deliveryId?: string;
  at: string;
}

export interface UserRegisteredEvent {
  tenantId: string;
  userId: string;
  email: string;
  name: string;
  at: string;
}

export interface RecordMutationEvent {
  /** Data controller location of the mutated table, e.g. "/api/tables/members". */
  location: string;
  ids: string[];
  actorId?: string;
  actorName?: string;
  at: string;
}

interface AutomationEventPayloads {
  "dms.member-added": MemberAddedEvent;
  "dms.member-removed": MemberRemovedEvent;
  "dms.invite-created": InviteCreatedEvent;
  "dms.user-registered": UserRegisteredEvent;
  "dms.record-created": RecordMutationEvent;
  "dms.record-updated": RecordMutationEvent;
  "dms.record-deleted": RecordMutationEvent;
}

export type AutomationEventName = keyof AutomationEventPayloads;

export type AutomationEventListener = (payload: unknown) => void;

const eventListeners = new Map<
  AutomationEventName,
  Set<AutomationEventListener>
>();

export function listenersFor(
  event: AutomationEventName,
): Set<AutomationEventListener> {
  const existing = eventListeners.get(event);
  if (existing) return existing;
  const created = new Set<AutomationEventListener>();
  eventListeners.set(event, created);
  return created;
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
    try {
      listener(payload);
    } catch {
      // a failing procedure must never break the emitting business flow
    }
  }
}
