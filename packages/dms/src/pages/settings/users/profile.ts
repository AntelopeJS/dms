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
import { assert } from "@antelopejs/interface-api-util";
import { Model } from "@antelopejs/interface-database-decorators";
import { SaveComponentFiles } from "@antelopejs/interface-dms/attachments";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import {
  GetComponentPermissionIds,
  PageController,
  RegisterPage,
} from "@antelopejs/interface-dms/page";
import { sanitizeUser } from "@antelopejs/interface-dms/auth";
import {
  normalizeEmail,
  SessionModel,
  type User,
  UserModel,
} from "@antelopejs/interface-dms/auth/db";
import { formSchema } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Section } from "@antelopejs/interface-dms/base/section";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import * as z from "zod";
import {
  listSessions,
  revokeAllSessions,
  revokeSession,
} from "./account-credentials";
import { type AccountExport, AccountExportThrottle } from "./account-data";
import {
  type AccountDeletionImpact,
  type AccountDeletionResult,
  loadAccountExport,
  loadDeletionImpact,
  requestAccountDeletion,
  requireStoredUser,
} from "./account-data-store";
import { userCategory } from "./category";
import { loadProfileAccess, type ProfileAccess } from "./profile-access";
import {
  AVATAR_ATTACHMENT_FIELD,
  AVATAR_DIMENSION_PX,
  AVATAR_MAX_UPLOAD_BYTES,
  AVATAR_MIMETYPES,
  AVATAR_STORAGE_PATH,
  avatarAttachmentFields,
  HTTP_BAD_REQUEST,
  type UpdateProfileInput,
} from "./profile-helpers";
import {
  confirmTotpSetup,
  disableTwoFactorMethod,
  enableEmailMethod,
  getTwoFactorStatus,
  regenerateBackupCodes,
  requestTwoFactorEmailCode,
  startTotpSetup,
} from "./two-factor-operations";

const PROFILE_URL = "/settings/user/profile";
const IMAGE_FIELD_TYPE = "image";
const HTTP_TOO_MANY_REQUESTS = 429;
const ACCOUNT_EXPORT_WINDOW_MS = 10_000;

const accountExportThrottle = new AccountExportThrottle(
  ACCOUNT_EXPORT_WINDOW_MS,
);

const avatarType = new DefaultDataTypes.ImageType({
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
});

/**
 * The personal information the profile saves. Email is accepted only when it
 * is the current one, and password never: both change on the Security page,
 * behind the current password.
 */
const profileFields = [
  { id: "avatar", type: avatarType },
  { id: "name", type: new DefaultDataTypes.StringType(), required: true },
  { id: "email", type: new DefaultDataTypes.EmailType() },
];

const PROFILE_TEXTS = "$page.settings.profile";

// The avatar field travels as a serialized image field: page registration
// finds it there and stamps the upload token bound to this form, which the
// save route claims its files for.
const personalInfoForm = CustomComponent("DmsProfilePersonalInfo")
  .options({
    endpoint: PROFILE_URL,
    avatarField: {
      id: "avatar",
      type: IMAGE_FIELD_TYPE,
      component: avatarType.inputComponent(),
    },
  })
  .meta({
    name: `${PROFILE_TEXTS}.title`,
    icon: "i-ph-identification-card",
  });

@RegisterPage()
export class ProfileSettingsController extends PageController("profile", {
  displayName: "$menu.profile",
  category: userCategory,
  icon: "i-ph-user-circle",
  order: 1,
  description: "$page.settings.description.profile",
}) {
  static profileComponent = Section({
    title: `${PROFILE_TEXTS}.title`,
    description: `${PROFILE_TEXTS}.description`,
  })
    .child("form", personalInfoForm)
    .meta({
      name: `${PROFILE_TEXTS}.title`,
      icon: "i-ph-identification-card",
    });

  static updateProfileSchema = formSchema(profileFields).extend({
    language: z.string().optional(),
  });

  static securityComponent = Section({
    title: `${PROFILE_TEXTS}.security_title`,
    description: `${PROFILE_TEXTS}.security_description`,
  })
    .child(
      "summary",
      CustomComponent("DmsProfileSecuritySummary").meta({
        name: `${PROFILE_TEXTS}.security_title`,
        icon: "i-ph-shield-check",
      }),
    )
    .meta({
      name: `${PROFILE_TEXTS}.security_title`,
      icon: "i-ph-shield-check",
    });

  // Each row shows only when the page it leads to opens for the user.
  static preferencesComponent = Section({
    title: `${PROFILE_TEXTS}.preferences.title`,
    description: `${PROFILE_TEXTS}.preferences.description`,
  })
    .child(
      "summary",
      CustomComponent("DmsProfilePreferencesSummary").meta({
        name: `${PROFILE_TEXTS}.preferences.title`,
        icon: "i-ph-sliders-horizontal",
      }),
    )
    .meta({
      name: `${PROFILE_TEXTS}.preferences.title`,
      icon: "i-ph-sliders-horizontal",
    });

  // Its own permission: a workspace can keep managed accounts from exporting
  // or deleting themselves by not granting it.
  static accountDataComponent = Section({
    title: `${PROFILE_TEXTS}.data.title`,
    description: `${PROFILE_TEXTS}.data.description`,
    danger: true,
  })
    .child(
      "actions",
      CustomComponent("DmsProfileAccountData").meta({
        name: `${PROFILE_TEXTS}.data.title`,
        icon: "i-ph-database",
      }),
    )
    .meta({
      name: `${PROFILE_TEXTS}.data.title`,
      icon: "i-ph-database",
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
    assert(
      !submitted.password,
      HTTP_BAD_REQUEST,
      "error.password_change_requires_current_password",
    );
    const persistedUser = await SaveComponentFiles(
      {
        context,
        fields: avatarAttachmentFields,
        componentIds: GetComponentPermissionIds(personalInfoForm),
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
    return sanitizeUser(persistedUser);
  }

  private async parseProfile(body: unknown): Promise<UpdateProfileInput> {
    const parsed =
      await ProfileSettingsController.updateProfileSchema.safeParseAsync(body);
    if (parsed.success) return parsed.data as UpdateProfileInput;
    // One issue, not the whole ZodError: stringifying it dumps the raw issue
    // array, which a toast would render verbatim. The field is kept in front
    // of the message because zod's messages do not name their field.
    const [issue] = parsed.error.issues;
    const field = issue?.path.join(".");
    throw new HTTPResult(
      HTTP_BAD_REQUEST,
      issue ? (field ? `${field}: ${issue.message}` : issue.message) : "",
    );
  }

  private async writeProfile(
    body: unknown,
    userModel: UserModel,
  ): Promise<void> {
    const { name, email, language, avatar } = await this.parseProfile(body);
    // Older clients resend the current email with every save; anything else
    // is an email change, which needs the current password.
    assert(
      !email || normalizeEmail(email) === this.user.email,
      HTTP_BAD_REQUEST,
      "error.email_change_requires_current_password",
    );
    this.user.name = name;
    if (language) this.user.language = language;
    if (avatar !== undefined) this.user.avatar = avatar;
    await userModel.update(this.user);
  }

  /**
   * The roles the signed-in user holds in the current workspace and whether
   * they own it, for the "Your access" summary.
   */
  @Get("/access")
  getAccess(@Context() context: RequestContext): Promise<ProfileAccess> {
    return loadProfileAccess(this.user, getRequestTenantId(context));
  }

  /** Everything the DMS keeps about the signed-in user, as a JSON file. */
  @Get("/account-export")
  async exportAccount(
    @AuthUserWithPermission(ProfileSettingsController.accountDataComponent)
    user: User,
  ): Promise<AccountExport> {
    assert(
      accountExportThrottle.tryAcquire(user._id, Date.now()),
      HTTP_TOO_MANY_REQUESTS,
      "$page.settings.profile.data.export_throttled",
    );
    return loadAccountExport(await requireStoredUser(user));
  }

  /** What deleting the account would remove, and who must own what first. */
  @Get("/account-deletion")
  async getAccountDeletion(
    @AuthUserWithPermission(ProfileSettingsController.accountDataComponent)
    user: User,
  ): Promise<AccountDeletionImpact> {
    return loadDeletionImpact(await requireStoredUser(user));
  }

  @Post("/account-deletion")
  async deleteAccount(
    @AuthUserWithPermission(ProfileSettingsController.accountDataComponent)
    user: User,
    @JSONBody() body: unknown,
  ): Promise<AccountDeletionResult> {
    return requestAccountDeletion(user, body);
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

  @Delete("/sessions/:id")
  revokeSession(
    @Parameter("id", "param") id: string,
    @Model(SessionModel) sessionModel: SessionModel,
  ) {
    return revokeSession(this.user, id, sessionModel);
  }

  @Delete("/sessions")
  revokeAllSessions(
    @Model(SessionModel) sessionModel: SessionModel,
    @Model(UserModel) userModel: UserModel,
  ) {
    return revokeAllSessions(this.user, sessionModel, userModel);
  }
}
