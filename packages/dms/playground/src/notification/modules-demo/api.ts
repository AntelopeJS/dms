import { Controller, Post } from "@antelopejs/interface-api";
import { AuthRawUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { Notification } from "@antelopejs/interface-dms/notifications";
import { DEMO_MESSAGES } from "../notification-api";
import { moduleOneAlertsSubject, moduleTwoNotificationsSubject } from "./page";

/** A documentation address (RFC 5737), never a real visitor's. */
const DEMO_IP = "203.0.113.42";
const DEMO_PACKAGE = "#1042";

export class ModulesNotificationAPIController extends Controller(
  "/api/notification",
) {
  @Post("module-one")
  async sendModuleOne(@AuthRawUser() user: User) {
    const notification = Notification()
      .icon("i-ph-shield-warning")
      .title(`${DEMO_MESSAGES}.security_alert.title`)
      .description(`${DEMO_MESSAGES}.security_alert.description`)
      .linkTo("/settings/user/security")
      .subject(moduleOneAlertsSubject)
      .params({ ip: DEMO_IP })
      .tone("warning")
      .build();

    await notification.toUser(user._id);

    return { success: true, message: "Security notification sent!" };
  }

  @Post("module-two")
  async sendModuleTwo(@AuthRawUser() user: User) {
    const notification = Notification()
      .icon("i-ph-truck")
      .title(`${DEMO_MESSAGES}.shipment.title`)
      .description(`${DEMO_MESSAGES}.shipment.description`)
      .linkTo("/settings/user/notifications")
      .subject(moduleTwoNotificationsSubject)
      .params({ package: DEMO_PACKAGE })
      .tone("success")
      .build();

    await notification.toUser(user._id);

    return { success: true, message: "Logistics notification sent!" };
  }

  @Post("broadcast-all")
  async broadcastToAll() {
    const notification = Notification()
      .icon("i-ph-wrench")
      .title(`${DEMO_MESSAGES}.maintenance.title`)
      .description(`${DEMO_MESSAGES}.maintenance.description`)
      .linkTo("/settings/user/notifications")
      .subject(moduleOneAlertsSubject)
      .build();

    await notification.broadcast();

    return { success: true, message: "Broadcast sent to all users!" };
  }
}
