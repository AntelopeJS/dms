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

const idempotentSchema = z.object({ key: z.string().trim().min(1) });

function parseBody<T>(schema: z.ZodType<T>, rawBody: unknown): T {
  const parsed = schema.safeParse(rawBody ?? {});
  if (parsed.success) return parsed.data;
  throw new HTTPResult(
    HTTP_BAD_REQUEST,
    JSON.stringify(parsed.error.issues),
    JSON_TYPE,
  );
}

// How many notifications each user sent themselves from the test page: the
// nav badge of the page counts them.
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

  @Post("send-dms-update")
  async sendDmsUpdate(@AuthRawUser() user: User) {
    const notification = Notification()
      .icon("i-ph-arrow-circle-up")
      .title(`${DEMO_MESSAGES}.dms_update.title`)
      .description(`${DEMO_MESSAGES}.dms_update.description`)
      .linkTo("/modules")
      .subject(GeneralSubject)
      .tone("primary")
      .build();

    await notification.toUser(user._id);

    return { success: true, message: "DMS update notification sent!" };
  }

  @Post("send-hosting-promo")
  async sendHostingPromo(@AuthRawUser() user: User) {
    const notification = Notification()
      .icon("i-ph-tag")
      .title(`${DEMO_MESSAGES}.hosting_promo.title`)
      .description(`${DEMO_MESSAGES}.hosting_promo.description`)
      .linkTo("https://antelopejs.com/hosting")
      .subject(GeneralSubject)
      .tone("primary")
      .build();

    await notification.toUser(user._id);

    return { success: true, message: "Hosting promo notification sent!" };
  }

  @Post("broadcast-all")
  async broadcastToAll() {
    const notification = Notification()
      .icon("i-ph-wrench")
      .title(`${DEMO_MESSAGES}.maintenance.title`)
      .description(`${DEMO_MESSAGES}.maintenance.description`)
      .linkTo("/settings/user/notifications")
      .subject(GeneralSubject)
      .build();

    await notification.broadcast({ readScope: "shared" });

    return { success: true, message: "Broadcast sent to all users!" };
  }

  /** Sends at most once per key: a second submit of the same key is dropped. */
  @Post("send-idempotent")
  async sendIdempotent(
    @AuthRawUser() user: User,
    @JSONBody() rawBody: unknown,
  ) {
    const { key } = parseBody(idempotentSchema, rawBody);
    const notification = Notification()
      .icon("i-ph-fingerprint")
      .title(`${DEMO_MESSAGES}.idempotent.title`)
      .description(`${DEMO_MESSAGES}.idempotent.description`)
      .params({ key })
      .subject(PlaygroundSubject)
      .build();

    await notification.toUser(user._id, { idempotencyKey: key });

    return { success: true };
  }

  /** A translated title whose `{count}` the reader's language writes. */
  @Post("send-params")
  async sendParams(@AuthRawUser() user: User) {
    const notification = Notification()
      .icon("i-ph-shopping-cart")
      .title(`${DEMO_MESSAGES}.orders.title`)
      .description(`${DEMO_MESSAGES}.orders.description`)
      .params({ count: DEMO_ORDER_COUNT })
      .subject(PlaygroundSubject)
      .tone("success")
      .build();

    await notification.toUser(user._id);

    return { success: true };
  }

  /** Every member holding one of the workspace's roles receives it. */
  @Post("send-to-roles")
  async sendToRoles(
    @Context() ctx: RequestContext,
    @AuthRawUser() _user: User,
  ) {
    const roles = await GetModel(RoleModel, getRequestTenantId(ctx)).getAll();
    const notification = Notification()
      .icon("i-ph-users-three")
      .title(`${DEMO_MESSAGES}.roles.title`)
      .description(`${DEMO_MESSAGES}.roles.description`)
      .subject(PlaygroundSubject)
      .build();

    await notification.toRoles(roles.map((role) => role._id));

    return { success: true, roles: roles.length };
  }
}
