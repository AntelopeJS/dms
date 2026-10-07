import {
  Controller,
  HTTPResult,
  JSONBody,
  Post,
} from "@antelopejs/interface-api";
import { AuthRawUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  GeneralSubject,
  Notification,
} from "@antelopejs/interface-dms/notifications";
import { z } from "zod";

const HTTP_BAD_REQUEST = 400;
/** The demo texts, in the playground's locale files (`demo.notifications`). */
export const DEMO_MESSAGES = "$demo.notifications";
const JSON_TYPE = "application/json";

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

export class NotificationAPIController extends Controller("/api/notification") {
  @Post("send")
  async sendNotification(
    @AuthRawUser() user: User,
    @JSONBody() rawBody: unknown,
  ) {
    const parsed = customNotificationSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw new HTTPResult(
        HTTP_BAD_REQUEST,
        JSON.stringify(parsed.error.issues),
        JSON_TYPE,
      );
    }
    const body = parsed.data;
    const notification = Notification()
      .icon(body.icon || "i-ph-bell")
      .title(body.title)
      .description(body.description)
      .linkTo(body.linkTo || "")
      .subject(GeneralSubject)
      .build();

    await notification.toUser(user._id);

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
}
