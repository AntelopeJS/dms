import {
  Context,
  Controller,
  Delete,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert } from "@antelopejs/interface-api-util";
import {
  DataController,
  RegisterDataController,
} from "@antelopejs/interface-data-api";
import {
  Access,
  AccessMode,
  Listable,
  ModelReference,
  Sortable,
} from "@antelopejs/interface-data-api/metadata";
import { roleSettingDataAPI } from "@antelopejs/interface-dms/data-controllers/roles";
import { UserInvite, UserInviteModel } from "@antelopejs/interface-dms/db";
import { INVITE_EDIT_FORM_SLOT_ID } from "@antelopejs/interface-dms/invite-extensions";
import {
  completeInviteResolution,
  decideInvite,
  loadInviteForAction,
} from "@antelopejs/interface-dms/invite-resolution";
import {
  createUserInviteToken,
  sendTenantInviteEmail,
} from "@antelopejs/interface-dms/invites";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  Column,
  Exported,
  Searchable,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { StatusType } from "@antelopejs/interface-dms/base/data-types/status-type";
import { ReadonlyBehaviorType } from "@antelopejs/interface-dms/base/types";
import { fireAndForget } from "@antelopejs/interface-dms/utils/fire-and-forget";
import { inviteEditRoute, inviteGetRoute } from "./invite-extension-routes";
import {
  inviteLanguageSelectItems,
  memberInviteForm,
} from "./member-invite-form";
import {
  INVITES_PAGE_PATH,
  MembersSettingsController,
  membersTableAddAction,
} from "./members";

const INVITES_PERMISSION_ID = "settings.user.invites";

@RegisterDataController()
export class inviteSettingDataAPI extends DataController(
  UserInvite,
  {
    list: TableViewRoutes.List,
    get: inviteGetRoute,
    edit: inviteEditRoute,
  },
  Controller("/api/tables/admin-invites"),
) {
  @ModelReference()
  @TenantScopedModel(UserInviteModel)
  declare model: UserInviteModel;

  @Listable()
  @Exported()
  @Access(AccessMode.ReadOnly)
  declare _id: string;

  @Listable()
  @Searchable()
  @Exported()
  @Column({
    name: "$page.settings.invites.column.email",
    type: new DefaultDataTypes.EmailType({
      placeholder: "$page.settings.invites.placeholder.email",
    }),
    filterable: true,
  })
  @Sortable()
  @Access(AccessMode.ReadOnly)
  declare email: string;

  @Exported()
  @Column({
    name: "$page.settings.invites.column.firstname",
    type: new DefaultDataTypes.StringType({
      placeholder: "$page.settings.members.invite.placeholder.firstname",
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare firstname: string;

  @Exported()
  @Column({
    name: "$page.settings.invites.column.lastname",
    type: new DefaultDataTypes.StringType({
      placeholder: "$page.settings.members.invite.placeholder.lastname",
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare lastname: string;

  @Listable()
  @Column({
    name: "$page.settings.invites.column.roles",
    type: new DefaultDataTypes.RelationType({
      multiple: true,
      placeholder: "$page.settings.invites.placeholder.roles",
      dataApiController: roleSettingDataAPI,
      keyMapping: {
        label: "name",
        value: "_id",
      },
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare roles_ids: string[];

  @Listable()
  @Exported()
  @Column({
    name: "$page.settings.invites.column.owner",
    type: new DefaultDataTypes.BooleanType(),
  })
  @Access(AccessMode.ReadWrite)
  declare asTenantOwner: boolean;

  @Exported()
  @Column({
    name: "$page.settings.invites.column.language",
    type: new DefaultDataTypes.SelectType({
      items: inviteLanguageSelectItems,
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare language: string;

  @Exported()
  @Column({
    name: "$page.settings.invites.column.skip_email_validation",
    type: new DefaultDataTypes.BooleanType(),
    description: "$page.settings.invites.description.skip_email_validation",
  })
  @Access(AccessMode.ReadWrite)
  declare skipEmailValidation: boolean;

  @Exported()
  @Column({
    name: "$page.settings.invites.column.created_at",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
  })
  @Access(AccessMode.ReadOnly)
  declare createdAt: Date;

  @Exported()
  @Column({
    name: "$page.settings.invites.column.expires_at",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
  })
  @Access(AccessMode.ReadOnly)
  declare expiresAt: Date;

  @Listable(["expiresAt"])
  @Exported()
  @Column({
    name: "$page.settings.invites.column.status",
    type: new StatusType({
      onlineLabel: "$page.settings.invites.status.pending",
      offlineLabel: "$page.settings.invites.status.expired",
      onlineColor: "primary",
      offlineColor: "neutral",
    }),
  })
  @Access(AccessMode.ReadOnly)
  get status(): boolean {
    return new Date(this.table.expiresAt) > new Date();
  }
}

// Reached from the members page rather than the settings menu: nested under
// it, so its URL and breadcrumb go through Members. The permission keeps the
// id it had as a user-category page, so the roles that already grant it are
// unchanged.
@RegisterPage()
export class InvitesSettingsController extends PageController("invites", {
  displayName: "$menu.invites",
  category: MembersSettingsController,
  permission: { id: INVITES_PERMISSION_ID },
  hidden: true,
  icon: "i-ph-envelope-simple",
  description: "$page.settings.description.invites",
}) {
  static table = TableView(inviteSettingDataAPI, {
    caption: "$page.settings.invites.table.caption",
    labelKey: "email",
    // Modules edit the data they attached through `RegisterInviteExtension`
    // here, until the invitee accepts.
    formSlots: { edit: INVITE_EDIT_FORM_SLOT_ID },
    customButtons: [
      {
        label: "$page.settings.members.invite.button",
        icon: "i-ph-user-plus",
        color: "primary",
        permission: membersTableAddAction,
        target: {
          type: "modal",
          size: "lg",
          component: memberInviteForm,
          title: "$page.settings.members.invite.title",
          description: "$page.settings.members.invite.description",
        },
      },
    ],
    rowActions: {
      add: false,
      copyLink: false,
      delete: false,
      details: false,
      duplicate: false,
      edit: { isEnabled: true, isVisible: true },
      hasSelection: false,
      custom: [
        {
          label: "$page.settings.invites.action.resend",
          icon: "i-ph-arrow-clockwise",
          target: {
            type: "api",
            url: `${INVITES_PAGE_PATH}/{_id}/resend`,
            method: "POST",
            successMessage: "$page.settings.invites.action.resend_success",
            confirm: {
              title: "$page.settings.invites.action.resend_confirm_title",
              description:
                "$page.settings.invites.action.resend_confirm_description",
              confirmColor: "primary",
            },
          },
        },
        {
          label: "$page.settings.invites.action.cancel",
          icon: "i-ph-trash",
          target: {
            type: "api",
            url: `${INVITES_PAGE_PATH}/{_id}/cancel`,
            method: "DELETE",
            successMessage: "$page.settings.invites.action.cancel_success",
            confirm: {
              title: "$page.settings.invites.action.cancel_confirm_title",
              description:
                "$page.settings.invites.action.cancel_confirm_description",
              confirmColor: "error",
            },
          },
        },
      ],
    },
  });

  @Post("/:id/resend")
  async resendInvite(
    @Parameter("id", "param") id: string,
    @Context() ctx: RequestContext,
    @AuthUser() user: User,
  ) {
    const tenantId = getRequestTenantId(ctx);
    const existingInvite = await loadInviteForAction(tenantId, id);
    assert(existingInvite, 404, "$page.settings.invites.error.not_found");

    const { token } = await createUserInviteToken({
      tenantId,
      replacesInvite: existingInvite,
      email: existingInvite.email,
      firstname: existingInvite.firstname,
      lastname: existingInvite.lastname,
      language: existingInvite.language,
      roleIds: existingInvite.roles_ids,
      asTenantOwner: existingInvite.asTenantOwner,
      skipEmailValidation: existingInvite.skipEmailValidation,
      // Resending re-creates the row, so the module payloads have to be
      // carried over or the invitee would join without them — and the
      // displaced row must not read as an invitation that was retired.
      extensions: existingInvite.extensions ?? undefined,
      replacementReason: "resent",
    });

    fireAndForget(
      sendTenantInviteEmail({
        tenantId,
        email: existingInvite.email,
        token,
        firstname: existingInvite.firstname,
        lastname: existingInvite.lastname,
        language: existingInvite.language,
        inviterName: user.name,
      }),
      `invite email to "${existingInvite.email}"`,
    );
  }

  @Delete("/:id/cancel")
  async cancelInvite(
    @Parameter("id", "param") id: string,
    @Context() ctx: RequestContext,
  ) {
    const tenantId = getRequestTenantId(ctx);
    const existingInvite = await loadInviteForAction(tenantId, id);
    assert(existingInvite, 404, "$page.settings.invites.error.not_found");

    const resolution = await decideInvite({
      tenantId,
      invite: existingInvite,
      reason: "cancelled",
    });
    await completeInviteResolution(resolution);
  }
}
