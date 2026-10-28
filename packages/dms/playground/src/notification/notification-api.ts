import {
  Context,
  Controller,
  HTTPResult,
  JSONBody,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { AuthRawUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { RoleModel } from "@antelopejs/interface-dms/db";
import {
  GeneralSubject,
  Notification,
} from "@antelopejs/interface-dms/notifications";
import { NotifyMenuChanged } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { z } from "zod";
import { PlaygroundSubject } from "./subjects";

const HTTP_BAD_REQUEST = 400;
/** The demo texts, in the playground's locale files (`demo.notifications`). */
export const DEMO_MESSAGES = "$demo.notifications";
const JSON_TYPE = "application/json";
const DEMO_ORDER_COUNT = 3;

/**
 * A blank title or description is refused field by field, so the form shows
 * the error under the field instead of sending an empty notification.
 */
const customNotificationSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  icon: z.string().trim().nullish(),
  linkTo: z.string().trim().nullish(),
});

function parseBody<T>(schema: z.ZodType<T>, rawBody: unknown): T {
  const parsed = schema.safeParse(rawBody ?? {});
  if (parsed.success) return parsed.data;
  throw new HTTPResult(
    HTTP_BAD_REQUEST,
    JSON.stringify(parsed.error.issues),
    JSON_TYPE,
  );
}

const sentCounts = new Map<string, number>();

export function sentNotificationCount(userId: string): number {
  return sentCounts.get(userId) ?? 0;
}

/** Counts a notification the caller sent, and refreshes the menu badge. */
function countSent(user: User, ctx: RequestContext): void {
  sentCounts.set(user._id, sentNotificationCount(user._id) + 1);
  fireAndForget(
    NotifyMenuChanged(getRequestTenantId(ctx)),
    "notification badge refresh",
  );
}

/** The one-click notifications of the test page, each showing one option. */
export const NOTIFICATION_PRESETS = [
  "dms-update",
  "hosting-promo",
  "broadcast",
  "idempotent",
  "params",
  "roles",
] as const;

type NotificationPreset = (typeof NOTIFICATION_PRESETS)[number];

const presetSchema = z.object({ preset: z.enum(NOTIFICATION_PRESETS) });

/** Sent twice, the second one is dropped: the key is the same. */
const IDEMPOTENCY_KEY = "order-42-shipped";

type PresetSender = (user: User, ctx: RequestContext) => Promise<void>;

async function sendDmsUpdate(user: User): Promise<void> {
  const notification = Notification()
    .icon("i-ph-arrow-circle-up")
    .title(`${DEMO_MESSAGES}.dms_update.title`)
    .description(`${DEMO_MESSAGES}.dms_update.description`)
    .linkTo("/modules")
    .subject(GeneralSubject)
    .tone("primary")
    .build();
  await notification.toUser(user._id);
}

async function sendHostingPromo(user: User): Promise<void> {
  const notification = Notification()
    .icon("i-ph-tag")
    .title(`${DEMO_MESSAGES}.hosting_promo.title`)
    .description(`${DEMO_MESSAGES}.hosting_promo.description`)
    .linkTo("https://antelopejs.com/hosting")
    .subject(GeneralSubject)
    .tone("primary")
    .build();
  await notification.toUser(user._id);
}

async function broadcastToAll(): Promise<void> {
  const notification = Notification()
    .icon("i-ph-wrench")
    .title(`${DEMO_MESSAGES}.maintenance.title`)
    .description(`${DEMO_MESSAGES}.maintenance.description`)
    .linkTo("/settings/user/notifications")
    .subject(GeneralSubject)
    .build();
  await notification.broadcast({ readScope: "shared" });
}

async function sendIdempotent(user: User): Promise<void> {
  const notification = Notification()
    .icon("i-ph-fingerprint")
    .title(`${DEMO_MESSAGES}.idempotent.title`)
    .description(`${DEMO_MESSAGES}.idempotent.description`)
    .params({ key: IDEMPOTENCY_KEY })
    .subject(PlaygroundSubject)
    .build();
  await notification.toUser(user._id, { idempotencyKey: IDEMPOTENCY_KEY });
}

/** A translated title whose `{count}` the reader's language writes. */
async function sendWithParams(user: User): Promise<void> {
  const notification = Notification()
    .icon("i-ph-shopping-cart")
    .title(`${DEMO_MESSAGES}.orders.title`)
    .description(`${DEMO_MESSAGES}.orders.description`)
    .params({ count: DEMO_ORDER_COUNT })
    .subject(PlaygroundSubject)
    .tone("success")
    .build();
  await notification.toUser(user._id);
}

/** Every member holding one of the workspace's roles receives it. */
async function sendToRoles(_user: User, ctx: RequestContext): Promise<void> {
  const roles = await GetModel(RoleModel, getRequestTenantId(ctx)).getAll();
  const notification = Notification()
    .icon("i-ph-users-three")
    .title(`${DEMO_MESSAGES}.roles.title`)
    .description(`${DEMO_MESSAGES}.roles.description`)
    .subject(PlaygroundSubject)
    .build();
  await notification.toRoles(roles.map((role) => role._id));
}

const PRESET_SENDERS: Record<NotificationPreset, PresetSender> = {
  "dms-update": sendDmsUpdate,
  "hosting-promo": sendHostingPromo,
  broadcast: broadcastToAll,
  idempotent: sendIdempotent,
  params: sendWithParams,
  roles: sendToRoles,
};

export class NotificationAPIController extends Controller("/api/notification") {
  @Post("send")
  async sendNotification(
    @Context() ctx: RequestContext,
    @AuthRawUser() user: User,
    @JSONBody() rawBody: unknown,
  ) {
    const body = parseBody(customNotificationSchema, rawBody);
    const notification = Notification()
      .icon(body.icon || "i-ph-bell")
      .title(body.title)
      .description(body.description)
      .linkTo(body.linkTo || "")
      .subject(GeneralSubject)
      .build();

    await notification.toUser(user._id);
    countSent(user, ctx);

    return { success: true, message: "Notification sent!" };
  }

  /** Sends the preset picked in the form: see `NOTIFICATION_PRESETS`. */
  @Post("send-preset")
  async sendPreset(
    @Context() ctx: RequestContext,
    @AuthRawUser() user: User,
    @JSONBody() rawBody: unknown,
  ) {
    const { preset } = parseBody(presetSchema, rawBody);
    await PRESET_SENDERS[preset](user, ctx);
    return { success: true };
  }
}
