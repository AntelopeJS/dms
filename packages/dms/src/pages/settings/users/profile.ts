import {
  Context,
  Delete,
  Get,
  HTTPResult,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { Model } from "@antelopejs/interface-database-decorators";
import { SaveComponentFiles } from "@antelopejs/interface-dms/attachments";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import {
  GetComponentPermissionIds,
  PageController,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { sanitizeUser, send2FAEmail } from "@antelopejs/interface-dms/auth";
import {
  SessionModel,
  type User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import {
  Form,
  FormPageLayout,
  formSchema,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { generateUrl, verifyTOTP } from "2fa";
import randomstring from "randomstring";
import * as z from "zod";
import { TWO_FACTOR_RATE_LIMIT_MS } from "../../../routes/auth/constants";
import {
  notifyBackupCodesRegenerated,
  notifyEmailChanged,
  notifyPasswordChanged,
  notifyTwoFactorDisabled,
  notifyTwoFactorEnabled,
} from "../../../utils/account-notifications";
import { generateAuthKey } from "../../../utils/auth-key";
import { authSchema } from "../../../validation/auth.schema";
import { userCategory } from "./category";
import {
  AVATAR_ATTACHMENT_FIELD,
  AVATAR_DIMENSION_PX,
  AVATAR_MAX_UPLOAD_BYTES,
  AVATAR_MIMETYPES,
  AVATAR_STORAGE_PATH,
  avatarAttachmentFields,
  DMS_ISSUER,
  extractSessionId,
  formatSession,
  generateBackupCodes,
  generateTotpSecret,
  HTTP_BAD_REQUEST,
  type SessionResponse,
  type UpdateProfileInput,
  verifyUserCode,
} from "./profile-helpers";

@RegisterPage()
export class ProfileSettingsController extends PageController(
  "profile",
  {
    displayName: "$menu.profile",
    category: userCategory,
    icon: "i-ph-user-circle",
    order: 1,
    description: "$page.settings.description.profile",
  },
  FormPageLayout(),
) {
  static profileComponent = Form({
    title: "$page.settings.profile.title",
    description: "$page.settings.profile.description",
    fields: [
      {
        id: "avatar",
        label: "$page.settings.profile.avatar",
        description: "$page.settings.profile.avatar_description",
        type: new DefaultDataTypes.ImageType({
          path: AVATAR_STORAGE_PATH,
          attachmentField: AVATAR_ATTACHMENT_FIELD,
          constraints: {
            allowedMimetypes: AVATAR_MIMETYPES,
            maxSize: AVATAR_MAX_UPLOAD_BYTES,
          },
          resize: {
            maxWidth: AVATAR_DIMENSION_PX,
            maxHeight: AVATAR_DIMENSION_PX,
            fit: "cover",
          },
        }),
      },
      {
        id: "name",
        label: "$page.settings.profile.name",
        type: new DefaultDataTypes.StringType(),
        required: true,
      },
      {
        id: "email",
        label: "$page.settings.profile.email",
        type: new DefaultDataTypes.EmailType(),
        required: true,
      },
      {
        id: "password",
        label: "$page.settings.profile.password",
        type: new DefaultDataTypes.PasswordType({
          placeholder: "$page.settings.profile.password_placeholder",
          confirmPassword: true,
          confirmPlaceholder:
            "$page.settings.profile.password_confirm_placeholder",
          minLength: 8,
        }),
      },
    ],
    fetchUrl: "/settings/user/profile",
    submitUrl: "/settings/user/profile",
    submitUrlMethod: HttpMethod.post,
  });

  static updateProfileSchema = formSchema(
    ProfileSettingsController.profileComponent,
  ).extend({
    language: z.string().optional(),
  });

  static languageComponent = CustomComponent("DmsProfileLanguage").meta({
    name: "$page.settings.profile.language_title",
    icon: "i-ph-translate",
  });

  static twoFactorComponent = CustomComponent("DmsProfileTwoFactor").meta({
    name: "$page.settings.two_factor.title",
    icon: "i-ph-shield-check",
  });

  static sessionsComponent = CustomComponent("DmsProfileSessions").meta({
    name: "$page.settings.sessions.title",
    icon: "i-ph-devices",
  });

  @AuthUserWithPermission(ProfileSettingsController.profileComponent)
  declare user: User;

  @Get("/")
  getProfile(): Promise<Partial<User>> {
    return sanitizeUser(this.user);
  }

  @Post("/")
  async updateProfile(
    @Context() context: RequestContext,
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
  ): Promise<Partial<User>> {
    assert(
      body && typeof body === "object" && !Array.isArray(body),
      HTTP_BAD_REQUEST,
      "Invalid profile",
    );
    const submitted = body as Record<string, unknown>;
    const previousEmail = this.user.email;
    const persistedUser = await SaveComponentFiles(
      {
        context,
        fields: avatarAttachmentFields,
        componentIds: GetComponentPermissionIds(
          ProfileSettingsController.profileComponent,
        ),
        submitted: { avatar: this.user.avatar, ...submitted },
        before: { avatar: (await userModel.get(this.user._id))?.avatar },
      },
      async (promoted) => {
        await this.writeProfile(promoted, userModel);
        const user = await userModel.get(this.user._id);
        if (!user) throw new Error("Updated profile was not found");
        return {
          id: user._id,
          document: { avatar: user.avatar },
          result: user,
        };
      },
    );
    if (persistedUser.email !== previousEmail) {
      void notifyEmailChanged(persistedUser._id, persistedUser.email);
    }
    if (submitted.password) void notifyPasswordChanged(persistedUser._id);
    return sanitizeUser(persistedUser);
  }

  private async writeProfile(
    body: unknown,
    userModel: UserModel,
  ): Promise<void> {
    const parsed =
      await ProfileSettingsController.updateProfileSchema.safeParseAsync(body);
    if (!parsed.success) {
      // One issue, not the whole ZodError: stringifying it dumps the raw issue
      // array, which the form toast renders verbatim at the user. The field is
      // kept in front of the message — these are zod's own messages, so they
      // do not name the field they came from, and this schema validates five.
      const [issue] = parsed.error.issues;
      const field = issue?.path.join(".");
      throw new HTTPResult(
        HTTP_BAD_REQUEST,
        issue ? (field ? `${field}: ${issue.message}` : issue.message) : "",
      );
    }
    const { name, email, password, language, avatar } =
      parsed.data as UpdateProfileInput;

    const normalizedEmail = email.toLowerCase();

    this.user.name = name;
    this.user.email = normalizedEmail;

    if (password) {
      this.user.password = password;
    }

    if (language) {
      this.user.language = language;
    }

    if (avatar !== undefined) {
      this.user.avatar = avatar;
    }

    await userModel.update(this.user);
  }

  @Get("/two-factor")
  getTwoFactorStatus() {
    return {
      methods: this.user.twoFactorMethods || [],
      hasBackupCodes: (this.user.twoFactorBackupCodes || []).length > 0,
    };
  }

  @Post("/two-factor/enable-totp")
  async enableTotp(@Model(UserModel) userModel: UserModel) {
    const secret = await generateTotpSecret();
    const otpAuthUrl = generateUrl(DMS_ISSUER, this.user.email, secret);

    this.user.twoFactorPendingSecret = secret;
    await userModel.update(this.user);

    return { secret, otpAuthUrl };
  }

  @Post("/two-factor/confirm-totp")
  async confirmTotp(
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
  ) {
    const { code } = assertValidation(body, (value) =>
      authSchema.confirmTotp.parse(value),
    );

    assert(this.user.twoFactorPendingSecret, 400, "error.totp_not_setup");
    assert(
      verifyTOTP(this.user.twoFactorPendingSecret, code),
      401,
      "error.invalid_2fa_code",
    );

    this.user.twoFactorSecret = this.user.twoFactorPendingSecret;
    this.user.twoFactorPendingSecret = null;

    const methods = this.user.twoFactorMethods || [];
    if (!methods.includes("totp")) {
      methods.push("totp");
    }
    this.user.twoFactorMethods = methods;

    const isFirstMethod = methods.length === 1;
    let backupCodes: string[] | undefined;

    if (isFirstMethod || (this.user.twoFactorBackupCodes || []).length === 0) {
      const codes = generateBackupCodes();
      this.user.twoFactorBackupCodes = codes.hashed;
      backupCodes = codes.plaintext;
    }

    await userModel.update(this.user);

    void notifyTwoFactorEnabled(this.user._id, "totp");

    return { success: true, backupCodes };
  }

  @Post("/two-factor/enable-email")
  async enableEmail(@Model(UserModel) userModel: UserModel) {
    const methods = this.user.twoFactorMethods || [];
    if (!methods.includes("email")) {
      methods.push("email");
    }
    this.user.twoFactorMethods = methods;

    const isFirstMethod = methods.length === 1;
    let backupCodes: string[] | undefined;

    if (isFirstMethod || (this.user.twoFactorBackupCodes || []).length === 0) {
      const codes = generateBackupCodes();
      this.user.twoFactorBackupCodes = codes.hashed;
      backupCodes = codes.plaintext;
    }

    await userModel.update(this.user);

    void notifyTwoFactorEnabled(this.user._id, "email");

    return { success: true, backupCodes };
  }

  @Post("/two-factor/disable")
  async disableTwoFactor(
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
  ) {
    const { method, code } = assertValidation(body, (value) =>
      authSchema.disableTwoFactor.parse(value),
    );

    const verifyMethod = method === "totp" ? "totp" : "email";
    assert(
      verifyUserCode(this.user, code, verifyMethod as "totp" | "email"),
      401,
      "error.invalid_2fa_code",
    );

    const methods = (this.user.twoFactorMethods || []).filter(
      (m) => m !== method,
    );
    this.user.twoFactorMethods = methods;

    if (method === "totp") {
      this.user.twoFactorSecret = null;
    }

    if (methods.length === 0) {
      this.user.twoFactorBackupCodes = [];
      this.user.twoFactorEmailCode = null;
      this.user.twoFactorEmailCodeRequestedAt = null;
    }

    await userModel.update(this.user);

    void notifyTwoFactorDisabled(this.user._id, method);

    return { success: true };
  }

  @Post("/two-factor/regenerate-backup")
  async regenerateBackupCodes(
    @JSONBody() body: unknown,
    @Model(UserModel) userModel: UserModel,
  ) {
    const { code } = assertValidation(body, (value) =>
      authSchema.regenerateBackup.parse(value),
    );

    assert(
      (this.user.twoFactorMethods || []).length > 0,
      400,
      "error.2fa_not_enabled",
    );

    const isValidTotp =
      this.user.twoFactorMethods.includes("totp") &&
      verifyUserCode(this.user, code, "totp");
    const isValidEmail =
      this.user.twoFactorMethods.includes("email") &&
      verifyUserCode(this.user, code, "email");
    assert(isValidTotp || isValidEmail, 401, "error.invalid_2fa_code");

    const codes = generateBackupCodes();
    this.user.twoFactorBackupCodes = codes.hashed;
    await userModel.update(this.user);

    void notifyBackupCodesRegenerated(this.user._id);

    return { backupCodes: codes.plaintext };
  }

  @Post("/two-factor/request-email-code")
  async requestTwoFactorEmailCode(@Model(UserModel) userModel: UserModel) {
    assert(
      this.user.twoFactorMethods?.includes("email"),
      400,
      "error.2fa_email_not_enabled",
    );

    const isRateLimited =
      this.user.twoFactorEmailCodeRequestedAt &&
      Date.now() - new Date(this.user.twoFactorEmailCodeRequestedAt).getTime() <
        TWO_FACTOR_RATE_LIMIT_MS;
    assert(!isRateLimited, 429, "error.rate_limited");

    const code = randomstring.generate({ length: 6, charset: "numeric" });
    this.user.twoFactorEmailCode = code;
    this.user.twoFactorEmailCodeRequestedAt = new Date();
    await userModel.update(this.user);

    await send2FAEmail(this.user, code);

    return { success: true };
  }

  @Get("/sessions")
  async getSessions(
    @Model(SessionModel) sessionModel: SessionModel,
    @Parameter("authorization", "header") authorization: string,
  ): Promise<SessionResponse[]> {
    const currentSessionId = extractSessionId(authorization);
    const sessions = await sessionModel.getByUserId(this.user._id);

    return sessions.map((session) => formatSession(session, currentSessionId));
  }

  @Delete("/sessions/:id")
  async revokeSession(
    @Parameter("id", "param") id: string,
    @Model(SessionModel) sessionModel: SessionModel,
  ) {
    const session = await sessionModel.get(id);
    assert(session, 404, "error.session_not_found");
    assert(session.userId === String(this.user._id), 403, "error.unauthorized");

    await sessionModel.delete(id);
    return { success: true };
  }

  @Delete("/sessions")
  async revokeAllSessions(
    @Model(SessionModel) sessionModel: SessionModel,
    @Model(UserModel) userModel: UserModel,
  ) {
    await sessionModel.deleteByUserId(this.user._id);

    this.user.authKey = generateAuthKey();
    await userModel.update(this.user);

    return { success: true };
  }
}
