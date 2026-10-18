import { GetModel } from "@antelopejs/interface-database-decorators";
import { TenantMemberModel } from "@antelopejs/interface-dms/db";
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
  params?: Record<string, unknown>;
  tone?: string;
  icon?: string;
  linkTo?: string;
  idempotencyKey?: string;
}

interface SendNotificationOutput {
  ok: boolean;
}

interface Recipients {
  userIds: string[];
  roleIds: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotificationTone(value: string): value is NotificationTone {
  return (NOTIFICATION_TONES as readonly string[]).includes(value);
}

/**
 * The notification stores flat interpolation params, while a wired port can
 * carry any JSON: booleans read as their text, an absent value is left out,
 * and a nested value, which no message could print, is dropped with a warning.
 */
function toNotificationParams(
  params: unknown,
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
    if (typeof value === "string" || typeof value === "number") {
      result[key] = value;
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
 * Members of one tenant holding any of the roles. Role ids belong to a tenant,
 * so a procedure fired by a tenant event names the tenant to keep the
 * notification inside it.
 */
async function tenantMembersWithRoles(
  tenantId: string,
  roleIds: string[],
): Promise<string[]> {
  const targetRoleIds = new Set(roleIds);
  const members = await GetModel(TenantMemberModel, tenantId).listAll();
  return members
    .filter((member) =>
      member.roleIds?.some((roleId) => targetRoleIds.has(roleId)),
    )
    .map((member) => member.userId);
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

// Built from its data rather than through the builder: every optional field is
// set or not depending on the input, which the builder's chained types do not
// express.
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
  async execute(input, ctx) {
    const { userIds, roleIds } = collectRecipients(input);
    if (userIds.length === 0 && roleIds.length === 0) {
      throw new Error(
        `${SEND_NOTIFICATION_ACTION_ID} requires at least one of userId / userIds / roleIds`,
      );
    }
    const sendable = buildNotification(input, ctx);
    const options = toSendOptions(input.idempotencyKey, ctx);
    const tenantId = input.tenantId?.trim();
    if (tenantId && roleIds.length > 0) {
      userIds.push(...(await tenantMembersWithRoles(tenantId, roleIds)));
    } else if (roleIds.length > 0) {
      await sendable.toRoles(roleIds, options);
    }
    if (userIds.length > 0) await sendable.toUsers(userIds, options);
    return { ok: true };
  },
};
