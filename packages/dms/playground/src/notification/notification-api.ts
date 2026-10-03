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
      .title("Mise à jour disponible")
      .description(
        "Une nouvelle version du DMS AntelopeJS est disponible. Cliquez pour voir les nouveautés.",
      )
      .linkTo("/settings/dashboard/general")
      .subject(GeneralSubject)
      .build();

    await notification.toUser(user._id);

    return { success: true, message: "DMS update notification sent!" };
  }

  @Post("send-hosting-promo")
  async sendHostingPromo(@AuthRawUser() user: User) {
    const notification = Notification()
      .icon("i-ph-tag")
      .title("Offre spéciale hébergement")
      .description(
        "-30% sur tous les hébergements AntelopeJS jusqu'à la fin du mois !",
      )
      .linkTo("https://antelopejs.com/hosting")
      .subject(GeneralSubject)
      .build();

    await notification.toUser(user._id);

    return { success: true, message: "Hosting promo notification sent!" };
  }
}
