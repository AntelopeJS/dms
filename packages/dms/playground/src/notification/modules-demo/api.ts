import { Controller, Post } from "@antelopejs/interface-api";
import { AuthRawUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { Notification } from "@antelopejs/interface-dms/notifications";
import { moduleOneAlertsSubject, moduleTwoNotificationsSubject } from "./page";

export class ModulesNotificationAPIController extends Controller(
  "/api/notification",
) {
  @Post("module-one")
  async sendModuleOne(@AuthRawUser() user: User) {
    const notification = Notification()
      .icon("i-ph-shield-check")
      .title("Security Alert")
      .description("Suspicious login attempt detected from unknown IP address")
      .linkTo("/settings/user/notifications")
      .subject(moduleOneAlertsSubject)
      .build();

    await notification.toUser(user._id);

    return { success: true, message: "Security notification sent!" };
  }

  @Post("module-two")
  async sendModuleTwo(@AuthRawUser() user: User) {
    const notification = Notification()
      .icon("i-ph-truck")
      .title("Logistics Update")
      .description("Your package has been shipped and is on its way")
      .linkTo("/settings/user/notifications")
      .subject(moduleTwoNotificationsSubject)
      .build();

    await notification.toUser(user._id);

    return { success: true, message: "Logistics notification sent!" };
  }

  @Post("broadcast-all")
  async broadcastToAll() {
    const notification = Notification()
      .icon("i-ph-bell-ringing")
      .title("System Announcement")
      .description("Important system announcement for all users")
      .linkTo("/settings/user/notifications")
      .subject(moduleOneAlertsSubject)
      .build();

    await notification.broadcast();

    return { success: true, message: "Broadcast sent to all users!" };
  }
}
