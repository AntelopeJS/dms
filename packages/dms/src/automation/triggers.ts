import type {
  JsonSchema,
  TriggerType,
} from "@antelopejs/interface-dms-automation";
import {
  type AutomationEventListener,
  type AutomationEventName,
  listenersFor,
  type RecordMutationEvent,
} from "./events";

const EMPTY_CONFIG_SCHEMA: JsonSchema = { type: "object", properties: {} };

const TENANT_ID_PROPERTY: JsonSchema = { type: "string" };
const AT_PROPERTY: JsonSchema = { type: "string" };

interface DmsEventTriggerSpec {
  event: AutomationEventName;
  name: string;
  description: string;
  icon: string;
  outputProperties: Record<string, JsonSchema>;
}

/**
 * In-process, best-effort fan-out. Durable invitation hooks can replay on
 * multiple instances; consumers must deduplicate effects by deliveryId.
 */
function createEventTrigger(spec: DmsEventTriggerSpec): TriggerType {
  return {
    id: spec.event,
    name: spec.name,
    description: spec.description,
    icon: spec.icon,
    cluster: "replicated",
    configSchema: EMPTY_CONFIG_SCHEMA,
    outputSchema: {
      type: "object",
      properties: {
        tenantId: TENANT_ID_PROPERTY,
        ...spec.outputProperties,
        at: AT_PROPERTY,
      },
    },
    async activate(_config, emit) {
      const listener: AutomationEventListener = (payload) => emit(payload);
      listenersFor(spec.event).add(listener);
      return listener;
    },
    async deactivate(handle) {
      listenersFor(spec.event).delete(handle as AutomationEventListener);
    },
  };
}

interface RecordTriggerConfig {
  location?: string;
}

interface RecordTriggerSpec {
  event: AutomationEventName;
  name: string;
  description: string;
  icon: string;
}

function createRecordTrigger(spec: RecordTriggerSpec): TriggerType {
  return {
    id: spec.event,
    name: spec.name,
    description: spec.description,
    icon: spec.icon,
    cluster: "replicated",
    configSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description:
            'Data controller location to watch, e.g. "/api/tables/members". Leave empty to fire for every table.',
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        location: { type: "string" },
        ids: { type: "array", items: { type: "string" } },
        actorId: { type: "string" },
        actorName: { type: "string" },
        at: AT_PROPERTY,
      },
    },
    async activate(config, emit) {
      const location = (
        config as RecordTriggerConfig | undefined
      )?.location?.trim();
      const listener: AutomationEventListener = (payload) => {
        if (location && (payload as RecordMutationEvent).location !== location)
          return;
        emit(payload);
      };
      listenersFor(spec.event).add(listener);
      return listener;
    },
    async deactivate(handle) {
      listenersFor(spec.event).delete(handle as AutomationEventListener);
    },
  };
}

export const TRIGGERS: TriggerType[] = [
  createEventTrigger({
    event: "dms.member-added",
    name: "Member added",
    description: "Fires when a user becomes a member of a tenant",
    icon: "i-ph-user-plus",
    outputProperties: {
      userId: { type: "string" },
      isTenantOwner: { type: "boolean" },
      deliveryId: { type: "string" },
    },
  }),
  createEventTrigger({
    event: "dms.member-removed",
    name: "Member removed",
    description: "Fires when members are removed from a tenant",
    icon: "i-ph-user-minus",
    outputProperties: {
      userIds: { type: "array", items: { type: "string" } },
    },
  }),
  createEventTrigger({
    event: "dms.invite-created",
    name: "Invite created",
    description: "Fires when a user invite is created on a tenant",
    icon: "i-ph-paper-plane-tilt",
    outputProperties: {
      inviteId: { type: "string" },
      email: { type: "string" },
      asTenantOwner: { type: "boolean" },
      roleIds: { type: "array", items: { type: "string" } },
      deliveryId: { type: "string" },
    },
  }),
  createEventTrigger({
    event: "dms.user-registered",
    name: "User registered",
    description: "Fires when a new user completes signup",
    icon: "i-ph-user-circle-plus",
    outputProperties: {
      userId: { type: "string" },
      email: { type: "string" },
      name: { type: "string" },
    },
  }),
  createRecordTrigger({
    event: "dms.record-created",
    name: "Record created",
    description: "Fires when rows are created in a TableView-backed table",
    icon: "i-ph-plus-circle",
  }),
  createRecordTrigger({
    event: "dms.record-updated",
    name: "Record updated",
    description: "Fires when rows are updated in a TableView-backed table",
    icon: "i-ph-pencil-simple",
  }),
  createRecordTrigger({
    event: "dms.record-deleted",
    name: "Record deleted",
    description: "Fires when rows are deleted in a TableView-backed table",
    icon: "i-ph-trash",
  }),
];
