import {
  Delete,
  Get,
  JSONBody,
  Parameter,
  Post,
} from "@antelopejs/interface-api";
import { Model } from "@antelopejs/interface-database-decorators";
import { sanitizeUser } from "@antelopejs/interface-dms/auth";
import {
  SessionModel,
  type User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { FormPageLayout } from "@antelopejs/interface-dms/base/layouts";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  changeEmail,
  changePassword,
  getSecurityOverview,
  listSessions,
  revokeOtherSessions,
  revokeSession,
} from "./account-credentials";
import { userCategory } from "./category";
import {
  confirmTotpSetup,
  disableTwoFactorMethod,
  enableEmailMethod,
  getTwoFactorStatus,
  markBackupCodesSaved,
  regenerateBackupCodes,
  requestTwoFactorEmailCode,
  startTotpSetup,
} from "./two-factor-operations";

/**
 * The account's sign-in security: password, sign-in email, two-factor and
 * sessions. Every credential change asks for the current password.
 */
@RegisterPage()
export class SecuritySettingsController extends PageController(
  "security",
  {
    displayName: "$menu.security",
    category: userCategory,
    icon: "i-ph-shield-check",
    order: 2,
    description: "$page.settings.description.security",
  },
  FormPageLayout(),
) {
  static statusComponent = CustomComponent("DmsSecurityStatus").meta({
    name: "$page.settings.security.status_title",
    icon: "i-ph-gauge",
  });

  static passwordComponent = CustomComponent("DmsSecurityPassword").meta({
    name: "$page.settings.security.password_title",
    icon: "i-ph-password",
  });

  static emailComponent = CustomComponent("DmsSecurityEmail").meta({
    name: "$page.settings.security.email_title",
    icon: "i-ph-envelope-simple",
  });

  static twoFactorComponent = CustomComponent("DmsSecurityTwoFactor").meta({
    name: "$page.settings.two_factor.title",
    icon: "i-ph-shield-check",
  });

  static sessionsComponent = CustomComponent("DmsSecuritySessions").meta({
    name: "$page.settings.sessions.title",
    icon: "i-ph-devices",
  });

  @AuthUserWithPermission(SecuritySettingsController)
  declare user: User;

  @Get("/")
  getOverview(@Model(SessionModel) sessionModel: SessionModel) {
    return getSecurityOverview(this.user, sessionModel);
  }

  @Post("/password")
  updatePassword(
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
    @Model(SessionModel) sessionModel: SessionModel,
    @Parameter("authorization", "header") authorization: string,
  ) {
    return changePassword(this.user, body, {
      userModel,
      sessionModel,
      authorization,
    });
  }

  @Post("/email")
  async updateEmail(
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
  ): Promise<Partial<User>> {
    await changeEmail(this.user, body, userModel);
    return sanitizeUser(this.user);
  }

  @Get("/two-factor")
  getTwoFactorStatus() {
    return getTwoFactorStatus(this.user);
  }

  @Post("/two-factor/enable-totp")
  enableTotp(@Model(UserModel) userModel: UserModel) {
    return startTotpSetup(this.user, userModel);
  }

  @Post("/two-factor/confirm-totp")
  confirmTotp(
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
  ) {
    return confirmTotpSetup(this.user, body, userModel);
  }

  @Post("/two-factor/enable-email")
  enableEmail(@Model(UserModel) userModel: UserModel) {
    return enableEmailMethod(this.user, userModel);
  }

  @Post("/two-factor/disable")
  disableTwoFactor(
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
  ) {
    return disableTwoFactorMethod(this.user, body, userModel);
  }

  @Post("/two-factor/regenerate-backup")
  regenerateBackupCodes(
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
  ) {
    return regenerateBackupCodes(this.user, body, userModel);
  }

  @Post("/two-factor/backup-codes-saved")
  markBackupCodesSaved(@Model(UserModel) userModel: UserModel) {
    return markBackupCodesSaved(this.user, userModel);
  }

  @Post("/two-factor/request-email-code")
  requestTwoFactorEmailCode(@Model(UserModel) userModel: UserModel) {
    return requestTwoFactorEmailCode(this.user, userModel);
  }

  @Get("/sessions")
  getSessions(
    @Model(SessionModel) sessionModel: SessionModel,
    @Parameter("authorization", "header") authorization: string,
  ) {
    return listSessions(this.user, { sessionModel, authorization });
  }

  @Delete("/other-sessions")
  revokeOtherSessions(
    @Model(SessionModel) sessionModel: SessionModel,
    @Parameter("authorization", "header") authorization: string,
  ) {
    return revokeOtherSessions(this.user, { sessionModel, authorization });
  }

  @Delete("/sessions/:id")
  revokeSession(
    @Parameter("id", "param") id: string,
    @Model(SessionModel) sessionModel: SessionModel,
  ) {
    return revokeSession(this.user, id, sessionModel);
  }
}
