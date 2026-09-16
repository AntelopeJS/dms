import {
  Hook,
  type HookHandler,
  RegisterHook,
  UnregisterHook,
} from "@antelopejs/interface-dms/hooks";
import {
  type RealtimeMutationContext,
  type RealtimeMutationEventType,
  registerRealtimeMutationListener,
  unregisterRealtimeMutationListener,
} from "@antelopejs/interface-dms/base/table-view";
import {
  type AutomationEventName,
  type MemberAddedEvent,
  type InviteCreatedEvent,
  emitAutomationEvent,
} from "./events";

const now = (): string => new Date().toISOString();

const onMemberAdded: HookHandler<Hook.MEMBER_ADDED> = (payload) => {
  const event: MemberAddedEvent = {
    tenantId: payload.tenantId,
    userId: payload.userId,
    isTenantOwner: payload.isTenantOwner,
    at: now(),
  };
  if (payload.deliveryId) event.deliveryId = payload.deliveryId;
  emitAutomationEvent("dms.member-added", event);
  return undefined;
};

const onMemberRemoved: HookHandler<Hook.MEMBER_REMOVED> = (payload) => {
  emitAutomationEvent("dms.member-removed", {
    tenantId: payload.tenantId,
    userIds: payload.userIds,
    at: now(),
  });
  return undefined;
};

// The INVITE_CREATED hook payload also carries the invite token; it is a
// signup credential, so it is deliberately not exposed to procedure runs.
const onInviteCreated: HookHandler<Hook.INVITE_CREATED> = (payload) => {
  const event: InviteCreatedEvent = {
    tenantId: payload.tenantId,
    inviteId: payload.inviteId,
    email: payload.email,
    asTenantOwner: payload.asTenantOwner,
    roleIds: payload.roleIds,
    at: now(),
  };
  if (payload.deliveryId) event.deliveryId = payload.deliveryId;
  emitAutomationEvent("dms.invite-created", event);
  return undefined;
};

const onUserRegistered: HookHandler<Hook.USER_REGISTERED> = (payload) => {
  emitAutomationEvent("dms.user-registered", {
    tenantId: payload.tenantId,
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    at: now(),
  });
  return undefined;
};

const MUTATION_EVENTS: Record<RealtimeMutationEventType, AutomationEventName> =
  {
    created: "dms.record-created",
    updated: "dms.record-updated",
    deleted: "dms.record-deleted",
  };

const onRecordMutation = (context: RealtimeMutationContext): void => {
  emitAutomationEvent(MUTATION_EVENTS[context.eventType], {
    location: context.controllerLocation,
    ids: context.ids,
    actorId: context.actor?.id,
    actorName: context.actor?.displayName,
    at: now(),
  });
};

/**
 * Wire the dms hooks and the TableView realtime-mutation listener into the
 * automation event fan-out. `emitAutomationEvent` never throws, so these
 * sources are safe side observers of the business flows that fire them.
 */
export function connectAutomationEventSources(): void {
  RegisterHook(Hook.MEMBER_ADDED, onMemberAdded);
  RegisterHook(Hook.MEMBER_REMOVED, onMemberRemoved);
  RegisterHook(Hook.INVITE_CREATED, onInviteCreated);
  RegisterHook(Hook.USER_REGISTERED, onUserRegistered);
  registerRealtimeMutationListener(onRecordMutation);
}

export function disconnectAutomationEventSources(): void {
  UnregisterHook(Hook.MEMBER_ADDED, onMemberAdded);
  UnregisterHook(Hook.MEMBER_REMOVED, onMemberRemoved);
  UnregisterHook(Hook.INVITE_CREATED, onInviteCreated);
  UnregisterHook(Hook.USER_REGISTERED, onUserRegistered);
  unregisterRealtimeMutationListener(onRecordMutation);
}
