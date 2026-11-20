import type {
  JsonSchema,
  TriggerType,
} from "@antelopejs/interface-dms-automation";
import {
  type AutomationEventName,
  type AutomationEventPayload,
  listenersFor,
  type RecordEventName,
} from "./events";
import { fieldHint, nodeText, titledProperties } from "./i18n";
import { isFunction } from "@antelopejs/interface-dms/utils/internal/type-check";

const TENANT_ID_PROPERTY: JsonSchema = { type: "string" };
const AT_PROPERTY: JsonSchema = { type: "string" };
const STRING: JsonSchema = { type: "string" };
const BOOLEAN: JsonSchema = { type: "boolean" };
const STRINGS: JsonSchema = { type: "array", items: { type: "string" } };

const INVITE_RESOLVED_REASONS = [
  "accepted",
  "cancelled",
  "replaced",
  "expired",
  "resent",
];

/** Drops the listener `activate` returned as the opaque handle, if registered. */
const removeListener = (
  event: AutomationEventName,
): TriggerType["deactivate"] =>
  async function deactivate(handle) {
    if (isFunction(handle)) listenersFor(event).delete(handle);
  };

/** The settings every configurable DMS event trigger may read. */
interface EventTriggerConfig {
  tenantId?: string;
  includeAutomationWrites?: boolean;
  reasons?: string[];
  includeOwnership?: boolean;
}

type EventFilter<E extends AutomationEventName> = (
  config: EventTriggerConfig,
  payload: AutomationEventPayload<E>,
) => boolean;

interface DmsEventTriggerSpec<E extends AutomationEventName> {
  event: E;
  /** Its texts under `dms.automation.triggers.<texts>` in the locales. */
  texts: string;
  icon: string;
  outputProperties: Record<string, JsonSchema>;
  /** Settings of the trigger, each filtering the events it fires for. */
  configProperties?: Record<string, JsonSchema>;
  filter?: EventFilter<E>;
  /** False for an event that belongs to no tenant: no `tenantId` output. */
  tenantScoped?: boolean;
  /**
   * The event can be caused by a procedure's write: the trigger ignores those
   * unless its `includeAutomationWrites` setting is on, and outputs the
   * procedure that caused one.
   */
  automationWrites?: boolean;
}

function trimmed(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function tenantFilter(
  config: EventTriggerConfig,
  payload: { tenantId?: string },
): boolean {
  const tenantId = trimmed(config.tenantId);
  return !tenantId || payload.tenantId === tenantId;
}

function automationWriteFilter(
  config: EventTriggerConfig,
  payload: AutomationEventPayload<AutomationEventName>,
): boolean {
  const caused =
    "originProcedureId" in payload && payload.originProcedureId !== undefined;
  return !caused || config.includeAutomationWrites === true;
}

const tenantConfigProperty = () => ({
  tenantId: {
    type: "string",
    maxLength: 128,
    description: fieldHint("triggers.shared", "tenantId"),
  },
});

const automationWritesConfigProperty = () => ({
  includeAutomationWrites: {
    type: "boolean",
    default: false,
    description: fieldHint("triggers.shared", "includeAutomationWrites"),
  },
});

const AUTOMATION_ORIGIN_OUTPUTS = {
  originProcedureId: STRING,
  originRunId: STRING,
};

/**
 * In-process, best-effort fan-out. Durable invitation hooks can replay on
 * multiple instances; consumers must deduplicate effects by deliveryId.
 */
function createEventTrigger<E extends AutomationEventName>(
  spec: DmsEventTriggerSpec<E>,
): TriggerType<EventTriggerConfig | undefined> {
  const configProperties: Record<string, JsonSchema> = {};
  Object.assign(configProperties, spec.configProperties);
  const outputProperties: Record<string, JsonSchema> = {};
  if (spec.tenantScoped ?? true) outputProperties.tenantId = TENANT_ID_PROPERTY;
  Object.assign(outputProperties, spec.outputProperties);
  if (spec.automationWrites) {
    Object.assign(configProperties, automationWritesConfigProperty());
    Object.assign(outputProperties, AUTOMATION_ORIGIN_OUTPUTS);
  }
  outputProperties.at = AT_PROPERTY;
  return {
    id: spec.event,
    name: nodeText(`triggers.${spec.texts}`, "name"),
    description: nodeText(`triggers.${spec.texts}`, "description"),
    icon: spec.icon,
    cluster: "replicated",
    configSchema: {
      type: "object",
      properties: titledProperties(configProperties),
    },
    outputSchema: {
      type: "object",
      properties: titledProperties(outputProperties),
    },
    async activate(config, emit) {
      const settings = config ?? {};
      const listener = (payload: AutomationEventPayload<E>) => {
        if (spec.automationWrites && !automationWriteFilter(settings, payload))
          return;
        if (spec.filter && !spec.filter(settings, payload)) return;
        emit(payload);
      };
      listenersFor(spec.event).add(listener);
      return listener;
    },
    deactivate: removeListener(spec.event),
  };
}

function createRecordTrigger(spec: {
  event: RecordEventName;
  texts: string;
  icon: string;
}): TriggerType<(EventTriggerConfig & { location?: string }) | undefined> {
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
          maxLength: 512,
          description: fieldHint("triggers.record", "location"),
        },
        ...tenantConfigProperty(),
      }),
    },
    outputSchema: {
      type: "object",
      properties: titledProperties({
        tenantId: TENANT_ID_PROPERTY,
        location: STRING,
        ids: STRINGS,
        deliveryId: STRING,
        actorId: STRING,
        actorName: STRING,
        at: AT_PROPERTY,
      }),
    },
    async activate(config, emit) {
      const settings = config ?? {};
      const location = trimmed(settings.location);
      const listener = (payload: AutomationEventPayload<RecordEventName>) => {
        if (location && payload.location !== location) return;
        if (!tenantFilter(settings, payload)) return;
        emit(payload);
      };
      listenersFor(spec.event).add(listener);
      return listener;
    },
    deactivate: removeListener(spec.event),
  };
}

export const TRIGGERS: TriggerType[] = [
  createEventTrigger({
    event: "dms.member-added",
    texts: "memberAdded",
    icon: "i-ph-user-plus",
    outputProperties: {
      userId: STRING,
      isTenantOwner: BOOLEAN,
      deliveryId: STRING,
    },
    automationWrites: true,
  }),
  createEventTrigger({
    event: "dms.member-removed",
    texts: "memberRemoved",
    icon: "i-ph-user-minus",
    outputProperties: {
      userIds: STRINGS,
    },
    automationWrites: true,
  }),
  createEventTrigger({
    event: "dms.invite-created",
    texts: "inviteCreated",
    icon: "i-ph-paper-plane-tilt",
    outputProperties: {
      inviteId: STRING,
      email: STRING,
      asTenantOwner: BOOLEAN,
      roleIds: STRINGS,
      deliveryId: STRING,
    },
    automationWrites: true,
  }),
  createEventTrigger({
    event: "dms.user-registered",
    texts: "userRegistered",
    icon: "i-ph-user-circle-plus",
    outputProperties: {
      userId: STRING,
      email: STRING,
      name: STRING,
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
  createEventTrigger({
    event: "dms.invite-resolved",
    texts: "inviteResolved",
    icon: "i-ph-envelope-simple-open",
    configProperties: {
      reasons: {
        type: "array",
        items: { type: "string", enum: INVITE_RESOLVED_REASONS },
        uniqueItems: true,
        default: [],
        description: fieldHint("triggers.inviteResolved", "reasons"),
      },
      ...tenantConfigProperty(),
    },
    filter: (config, payload) =>
      tenantFilter(config, payload) &&
      (!config.reasons?.length || config.reasons.includes(payload.reason)),
    outputProperties: {
      inviteId: STRING,
      email: STRING,
      reason: { type: "string", enum: INVITE_RESOLVED_REASONS },
      deliveryId: STRING,
    },
    automationWrites: true,
  }),
  createEventTrigger({
    event: "dms.member-roles-changed",
    texts: "memberRolesChanged",
    icon: "i-ph-key",
    configProperties: {
      ...tenantConfigProperty(),
      includeOwnership: {
        type: "boolean",
        default: true,
        description: fieldHint(
          "triggers.memberRolesChanged",
          "includeOwnership",
        ),
      },
    },
    filter: (config, payload) =>
      tenantFilter(config, payload) &&
      (config.includeOwnership !== false ||
        payload.addedRoleIds.length > 0 ||
        payload.removedRoleIds.length > 0),
    outputProperties: {
      userId: STRING,
      roleIds: STRINGS,
      previousRoleIds: STRINGS,
      addedRoleIds: STRINGS,
      removedRoleIds: STRINGS,
      isTenantOwner: BOOLEAN,
      previousIsTenantOwner: BOOLEAN,
      origin: {
        type: "string",
        enum: ["member-edit", "ownership", "role-deleted", "automation"],
      },
      actorId: STRING,
      deliveryId: STRING,
    },
    automationWrites: true,
  }),
  createEventTrigger({
    event: "dms.user-deleted",
    texts: "userDeleted",
    icon: "i-ph-user-minus",
    tenantScoped: false,
    outputProperties: {
      userId: STRING,
      email: STRING,
      tenantIds: STRINGS,
      reason: { type: "string", enum: ["self"] },
      deliveryId: STRING,
    },
  }),
  createEventTrigger({
    event: "dms.tenant-created",
    texts: "tenantCreated",
    icon: "i-ph-buildings",
    outputProperties: {
      name: STRING,
      userId: STRING,
      isDefault: BOOLEAN,
      deliveryId: STRING,
    },
  }),
  createEventTrigger({
    event: "dms.tenant-deleted",
    texts: "tenantDeleted",
    icon: "i-ph-trash",
    outputProperties: {
      name: STRING,
      ownerUserId: STRING,
      ownerUserIds: STRINGS,
      ownerEmail: STRING,
      operationId: STRING,
      deliveryId: STRING,
    },
  }),
];
