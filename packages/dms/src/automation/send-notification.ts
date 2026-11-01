import { DEFAULT_TENANT_ID } from "@antelopejs/interface-dms/constants";
import {
  AutomationSubject,
  type NotificationData,
  type NotificationTone,
  type SendOptions,
} from "@antelopejs/interface-dms/notifications";
import { SendableNotification } from "@antelopejs/interface-dms/notifications/sendable";
import type {
  ActionType,
  ExecutionCtx,
} from "@antelopejs/interface-dms-automation";
import { fieldHint, nodeText, titledProperties } from "./i18n";

export const SEND_NOTIFICATION_ACTION_ID = "dms.send-notification";
const SEND_NOTIFICATION_TEXTS = "actions.sendNotification";

const DEFAULT_NOTIFICATION_ICON = "i-ph-bell";

/** The tones a notification's icon well takes ({@link NotificationTone}). */
export const NOTIFICATION_TONES = [
  "neutral",
  "primary",
  "success",
  "warning",
  "error",
] as const satisfies readonly NotificationTone[];

type NotificationParams = Record<string, string | number>;

interface SendNotificationInput {
  userId?: string;
  userIds?: string[];
  roleIds?: string[];
  tenantId?: string;
  title: string;
  description?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Wired automation params are arbitrary JSON until toNotificationParams converts supported scalars and drops nested values.
  params?: Record<string, unknown>;
  tone?: string;
  icon?: string;
  linkTo?: string;
  idempotencyKey?: string;
}

type SendNotificationOutput = {
  ok: boolean;
};

interface Recipients {
  userIds: string[];
  roleIds: string[];
}

function isPlainObject(value: SendNotificationInput["params"]) {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Preserve the existing object-not-array check at the automation input boundary.
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotificationTone(value: string): value is NotificationTone {
  const tones: readonly string[] = NOTIFICATION_TONES;
  return tones.includes(value);
}

/**
 * The notification stores flat interpolation params, while a wired port can
 * carry any JSON: booleans read as their text, an absent value is left out,
 * and a nested value, which no message could print, is dropped with a warning.
 */
function toNotificationParams(
  params: SendNotificationInput["params"],
  ctx: ExecutionCtx,
): NotificationParams | undefined {
  if (params === undefined || params === null) return undefined;
  if (!isPlainObject(params)) {
    throw new Error(
      `${SEND_NOTIFICATION_ACTION_ID}: params must be an object of strings and numbers`,
    );
  }
  const result: NotificationParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- String and numeric interpolation values are retained unchanged.
    if (typeof value === "string" || typeof value === "number") {
      result[key] = value;
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Boolean interpolation values are converted to their existing textual representation.
    } else if (typeof value === "boolean") {
      result[key] = String(value);
    } else {
      ctx.log("warn", `param "${key}" is not a string or a number; dropped`);
    }
  }
  return result;
}

function toTone(tone: string | undefined): NotificationTone | undefined {
  const value = tone?.trim();
  if (!value) return undefined;
  if (isNotificationTone(value)) return value;
  throw new Error(
    `${SEND_NOTIFICATION_ACTION_ID}: unknown tone "${value}" (expected one of ${NOTIFICATION_TONES.join(", ")})`,
  );
}

function collectRecipients(input: SendNotificationInput): Recipients {
  const userIds = [...(input.userIds ?? [])];
  const userId = input.userId?.trim();
  if (userId) userIds.push(userId);
  return { userIds, roleIds: input.roleIds ?? [] };
}

/**
 * A trigger's `deliveryId` is unique to one event, but two nodes of a
 * procedure (or two procedures) acting on the same event must not share a
 * delivery: the key is scoped to the node sending it.
 */
function toSendOptions(
  idempotencyKey: string | undefined,
  ctx: ExecutionCtx,
): SendOptions {
  const key = idempotencyKey?.trim();
  if (!key) return {};
  return {
    idempotencyKey: `${SEND_NOTIFICATION_ACTION_ID}:${ctx.procedureId}:${ctx.nodeId}:${key}`,
  };
}

function buildNotification(
  input: SendNotificationInput,
  ctx: ExecutionCtx,
): SendableNotification {
  const params = toNotificationParams(input.params, ctx);
  const tone = toTone(input.tone);
  const linkTo = input.linkTo?.trim();
  const data: NotificationData = {
    icon: input.icon?.trim() || DEFAULT_NOTIFICATION_ICON,
    title: input.title,
    description: input.description ?? "",
    subject: AutomationSubject,
  };
  if (params && Object.keys(params).length > 0) data.params = params;
  if (tone) data.tone = tone;
  if (linkTo) data.linkTo = linkTo;
  return new SendableNotification(data);
}

interface PreparedSend extends Recipients {
  sendable: SendableNotification;
  options: SendOptions;
  tenantId: string;
}

/** Everything a send needs, checked: a test run stops here. */
function prepareSend(
  input: SendNotificationInput,
  ctx: ExecutionCtx,
): PreparedSend {
  const { userIds, roleIds } = collectRecipients(input);
  if (userIds.length === 0 && roleIds.length === 0) {
    throw new Error(
      `${SEND_NOTIFICATION_ACTION_ID} requires at least one of userId / userIds / roleIds`,
    );
  }
  return {
    sendable: buildNotification(input, ctx),
    userIds,
    roleIds,
    options: toSendOptions(input.idempotencyKey, ctx),

    tenantId: input.tenantId?.trim() || DEFAULT_TENANT_ID,
  };
}

export const sendNotificationAction: ActionType<
  SendNotificationInput,
  SendNotificationOutput
> = {
  id: SEND_NOTIFICATION_ACTION_ID,
  name: nodeText(SEND_NOTIFICATION_TEXTS, "name"),
  description: nodeText(SEND_NOTIFICATION_TEXTS, "description"),
  icon: DEFAULT_NOTIFICATION_ICON,
  inputSchema: {
    type: "object",
    properties: titledProperties({
      userId: {
        type: "string",
        description: fieldHint(SEND_NOTIFICATION_TEXTS, "userId"),
      },
      userIds: { type: "array", items: { type: "string" } },
      roleIds: { type: "array", items: { type: "string" } },
      tenantId: {
        type: "string",
        description: fieldHint(SEND_NOTIFICATION_TEXTS, "tenantId"),
      },
      title: {
        type: "string",
        description: fieldHint(SEND_NOTIFICATION_TEXTS, "title"),
      },
      description: {
        type: "string",
        description: fieldHint(SEND_NOTIFICATION_TEXTS, "description"),
      },
      params: {
        type: "object",
        description: fieldHint(SEND_NOTIFICATION_TEXTS, "params"),
      },
      tone: { type: "string", enum: [...NOTIFICATION_TONES] },
      icon: { type: "string" },
      linkTo: { type: "string" },
      idempotencyKey: {
        type: "string",
        description: fieldHint(SEND_NOTIFICATION_TEXTS, "idempotencyKey"),
      },
    }),
    required: ["title"],
    anyOf: [
      { required: ["userId"] },
      { required: ["userIds"] },
      { required: ["roleIds"] },
    ],
  },
  outputSchema: {
    type: "object",
    properties: titledProperties({ ok: { type: "boolean" } }),
  },

  async dryRun(input, ctx) {
    prepareSend(input, ctx);
    ctx.log("info", "test run: notification not sent");
    return { ok: true };
  },
  async execute(input, ctx) {
    const { sendable, userIds, roleIds, options, tenantId } = prepareSend(
      input,
      ctx,
    );
    if (roleIds.length > 0)
      await sendable.toRoles(roleIds, { ...options, tenantId });
    if (userIds.length > 0) await sendable.toUsers(userIds, options);
    return { ok: true };
  },
};
