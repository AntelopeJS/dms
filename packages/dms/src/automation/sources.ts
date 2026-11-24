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
import { randomUUID } from "node:crypto";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import { TenantModel } from "@antelopejs/interface-dms/db";
import {
  type MemberAddedEvent,
  type InviteCreatedEvent,
  type RecordEventName,
  type RecordMutationEvent,
  type TenantCreatedEvent,
  emitAutomationEvent,
  listenersFor,
} from "./events";
import { emitOriginatedEvent } from "./loop-guard";

const now = (): string => new Date().toISOString();

const onMemberAdded: HookHandler<Hook.MEMBER_ADDED> = (payload) => {
  const event: MemberAddedEvent = {
    tenantId: payload.tenantId,
    userId: payload.userId,
    isTenantOwner: payload.isTenantOwner,
    at: now(),
  };
  if (payload.deliveryId) event.deliveryId = payload.deliveryId;
  emitOriginatedEvent(
    "dms.member-added",
    `${payload.tenantId}:${payload.userId}`,
    event,
  );
  return undefined;
};

const onMemberRemoved: HookHandler<Hook.MEMBER_REMOVED> = (payload) => {
  emitOriginatedEvent(
    "dms.member-removed",
    `${payload.tenantId}:${[...payload.userIds].sort().join(",")}`,
    {
      tenantId: payload.tenantId,
      userIds: payload.userIds,
      at: now(),
    },
  );
  return undefined;
};

const onInviteDeleted: HookHandler<Hook.INVITE_DELETED> = (payload) => {
  emitOriginatedEvent(
    "dms.invite-resolved",
    `${payload.tenantId}:${payload.inviteId}`,
    {
      tenantId: payload.tenantId,
      inviteId: payload.inviteId,
      email: payload.email,
      reason: payload.reason,
      deliveryId: payload.deliveryId ?? `${payload.inviteId}:${payload.reason}`,
      at: now(),
    },
  );
  return undefined;
};

const onUserDeleted: HookHandler<Hook.USER_DELETED> = (payload) => {
  emitAutomationEvent("dms.user-deleted", {
    userId: payload.userId,
    email: payload.email,
    tenantIds: payload.tenantIds,
    reason: payload.reason,
    deliveryId: `user-deleted:${payload.userId}`,
    at: now(),
  });
  return undefined;
};

async function readTenantName(tenantId: string): Promise<string | undefined> {
  try {
    const tenant = await GetModel(TenantModel).get(tenantId);
    return tenant?.name || undefined;
  } catch {
    return undefined;
  }
}

const onTenantBeingProvisioned: HookHandler<
  Hook.TENANT_BEING_PROVISIONED
> = async (payload) => {
  if (listenersFor("dms.tenant-created").size === 0) return undefined;
  const event: TenantCreatedEvent = {
    tenantId: payload.tenantId,
    isDefault: payload.tenantId === DEFAULT_TENANT_ID,
    deliveryId: `tenant-created:${payload.tenantId}`,
    at: now(),
  };
  const name = await readTenantName(payload.tenantId);
  if (name !== undefined) event.name = name;
  if (payload.userId) event.userId = payload.userId;
  emitAutomationEvent("dms.tenant-created", event);
  return undefined;
};

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
  emitOriginatedEvent(
    "dms.invite-created",
    `${payload.tenantId}:${payload.email}`,
    event,
  );
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

const MUTATION_EVENTS: Record<RealtimeMutationEventType, RecordEventName> = {
  created: "dms.record-created",
  updated: "dms.record-updated",
  deleted: "dms.record-deleted",
};

const onRecordMutation = (context: RealtimeMutationContext): void => {
  const event: RecordMutationEvent = {
    location: context.controllerLocation,
    ids: context.ids,
    deliveryId: randomUUID(),
    actorId: context.actor?.id,
    actorName: context.actor?.displayName,
    at: now(),
  };
  if (context.tenantId) event.tenantId = context.tenantId;
  emitAutomationEvent(MUTATION_EVENTS[context.eventType], event);
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
  RegisterHook(Hook.INVITE_DELETED, onInviteDeleted);
  RegisterHook(Hook.USER_DELETED, onUserDeleted);
  registerRealtimeMutationListener(onRecordMutation);
}

export function disconnectAutomationEventSources(): void {
  UnregisterHook(Hook.MEMBER_ADDED, onMemberAdded);
  UnregisterHook(Hook.MEMBER_REMOVED, onMemberRemoved);
  UnregisterHook(Hook.INVITE_CREATED, onInviteCreated);
  UnregisterHook(Hook.USER_REGISTERED, onUserRegistered);
  UnregisterHook(Hook.INVITE_DELETED, onInviteDeleted);
  UnregisterHook(Hook.USER_DELETED, onUserDeleted);
  unregisterRealtimeMutationListener(onRecordMutation);
}

let tenantProvisioningConnected = false;

/**
 * Feeds `dms.tenant-created` from `Hook.TENANT_BEING_PROVISIONED`. Called once
 * every module has started, so the handler runs after the provisioning
 * handlers those modules registered at start: a workspace that one of them
 * refuses unwinds before the event fires. The handler never throws, so it
 * never unwinds a workspace itself.
 */
export function connectTenantProvisioningSource(): void {
  if (tenantProvisioningConnected) return;
  tenantProvisioningConnected = true;
  RegisterHook(Hook.TENANT_BEING_PROVISIONED, onTenantBeingProvisioned);
}

export function disconnectTenantProvisioningSource(): void {
  if (!tenantProvisioningConnected) return;
  tenantProvisioningConnected = false;
  UnregisterHook(Hook.TENANT_BEING_PROVISIONED, onTenantBeingProvisioned);
}
