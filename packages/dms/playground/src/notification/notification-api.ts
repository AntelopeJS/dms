import { Controller, JSONBody, Post } from "@antelopejs/interface-api";
import { AuthRawUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  GeneralSubject,
  Notification,
} from "@antelopejs/interface-dms/notifications";

export class NotificationAPIController extends Controller("/api/notification") {
  @Post("send")
  async sendNotification(
    @AuthRawUser() user: User,
    @JSONBody() body: {
      title: string;
      description: string;
      icon?: string;
      linkTo?: string;
    },
  ) {
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
