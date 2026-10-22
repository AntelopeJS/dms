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
import { fieldHint, nodeText, titledProperties } from "./i18n";

const EMPTY_CONFIG_SCHEMA: JsonSchema = { type: "object", properties: {} };

const TENANT_ID_PROPERTY: JsonSchema = { type: "string" };
const AT_PROPERTY: JsonSchema = { type: "string" };

interface DmsEventTriggerSpec {
  event: AutomationEventName;
  /** Its texts under `dms.automation.triggers.<texts>` in the locales. */
  texts: string;
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
    name: nodeText(`triggers.${spec.texts}`, "name"),
    description: nodeText(`triggers.${spec.texts}`, "description"),
    icon: spec.icon,
    cluster: "replicated",
    configSchema: EMPTY_CONFIG_SCHEMA,
    outputSchema: {
      type: "object",
      properties: titledProperties({
        tenantId: TENANT_ID_PROPERTY,
        ...spec.outputProperties,
        at: AT_PROPERTY,
      }),
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
  /** Its texts under `dms.automation.triggers.<texts>` in the locales. */
  texts: string;
  icon: string;
}

function createRecordTrigger(spec: RecordTriggerSpec): TriggerType {
  return {
    id: spec.event,
    name: nodeText(`triggers.${spec.texts}`, "name"),
    description: nodeText(`triggers.${spec.texts}`, "description"),
    icon: spec.icon,
    cluster: "replicated",
    configSchema: {
      type: "object",
      properties: titledProperties({
        location: {
          type: "string",
          description: fieldHint("triggers.record", "location"),
        },
      }),
    },
    outputSchema: {
      type: "object",
      properties: titledProperties({
        location: { type: "string" },
        ids: { type: "array", items: { type: "string" } },
        actorId: { type: "string" },
        actorName: { type: "string" },
        at: AT_PROPERTY,
      }),
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
    texts: "memberAdded",
    icon: "i-ph-user-plus",
    outputProperties: {
      userId: { type: "string" },
      isTenantOwner: { type: "boolean" },
      deliveryId: { type: "string" },
    },
  }),
  createEventTrigger({
    event: "dms.member-removed",
    texts: "memberRemoved",
    icon: "i-ph-user-minus",
    outputProperties: {
      userIds: { type: "array", items: { type: "string" } },
    },
  }),
  createEventTrigger({
    event: "dms.invite-created",
    texts: "inviteCreated",
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
    texts: "userRegistered",
    icon: "i-ph-user-circle-plus",
    outputProperties: {
      userId: { type: "string" },
      email: { type: "string" },
      name: { type: "string" },
    },
  }),
  createRecordTrigger({
    event: "dms.record-created",
    texts: "recordCreated",
    icon: "i-ph-plus-circle",
  }),
  createRecordTrigger({
    event: "dms.record-updated",
    texts: "recordUpdated",
    icon: "i-ph-pencil-simple",
  }),
  createRecordTrigger({
    event: "dms.record-deleted",
    texts: "recordDeleted",
    icon: "i-ph-trash",
  }),
];
