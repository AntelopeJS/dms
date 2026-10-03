import {
  Context,
  Controller,
  Delete,
  Get,
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
  Joined,
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
import { inviteeDisplayName } from "@antelopejs/interface-dms/invites";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { TenantScopedModel } from "@antelopejs/interface-dms/tenant-scoped-model";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { User } from "@antelopejs/interface-dms/auth/db";
import { memberSettingDataAPI } from "@antelopejs/interface-dms/data-controllers";
import { getClientBaseUrl } from "../../../config";
import { buildAdminInviteSignupLink } from "../../../utils/admin-invite-email";
import {
  Column,
  Exported,
  Searchable,
  TableView,
  TableViewRoutes,
} from "@antelopejs/interface-dms/base";
import { DefaultDataTypes } from "@antelopejs/interface-dms/base/data-types/default-types";
import { StatusType } from "@antelopejs/interface-dms/base/data-types/status-type";
import {
  ButtonVariant,
  ReadonlyBehaviorType,
} from "@antelopejs/interface-dms/base/types";
import type { InviteEmailOutcome } from "./invite-email-outcome";
import { resendPendingInvite } from "./invite-resend";
import { inviteEditRoute, inviteGetRoute } from "./invite-extension-routes";
import {
  inviteLanguageSelectItems,
  memberInviteForm,
} from "./member-invite-form";
import {
  INVITES_PAGE_PATH,
  INVITES_PERMISSION_ID,
  INVITES_TAB_ICON,
  MEMBER_INVITE_BUTTON_ID,
  MEMBER_INVITE_HEADER_ACTION,
  MEMBER_LISTS_CHROME,
  memberListFormTexts,
  MEMBER_LISTS_PAGE_SIZE,
  MEMBERS_TAB_ICON,
  MembersSettingsController,
  membersTableAddAction,
  ROLE_QUICK_FILTER,
} from "./members";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";

const DAY_MS = 24 * 60 * 60 * 1000;
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;
const INVITE_NOT_FOUND = "$page.settings.invites.error.not_found";

/** A pending invitation's signup link, for the inviter to share by hand. */
export interface InviteLinkResponse {
  url: string;
}

@RegisterDataController()
export class inviteSettingDataAPI extends DataController(
  UserInvite,
  {
    list: TableViewRoutes.List,
    // The tab counters of the members page's lists.
    countBatch: TableViewRoutes.CountBatch,
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
    size: 170,
    display: { type: "identity", options: { icon: "i-ph-envelope-simple" } },
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
    filterable: true,
    size: 150,
    display: {
      type: "pills",
      options: {
        exclusive: {
          field: "asTenantOwner",
          label: "$page.settings.members.owner",
          icon: "i-ph-crown",
        },
        emptyLabel: "$page.settings.members.no_role",
      },
    },
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

  @Listable()
  @Exported()
  @Sortable()
  @Column({
    name: "$page.settings.invites.column.created_at",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
    size: 120,
    display: {
      type: "relative_date",
      label: "$page.settings.invites.column.sent",
      options: {
        style: "day",
        tone: "dimmed",
        byField: "invitedByName",
        byLabel: "$page.settings.invites.sent_by",
      },
    },
  })
  @Access(AccessMode.ReadOnly)
  declare createdAt: Date;

  @Listable()
  @Exported()
  @Column({
    name: "$page.settings.invites.column.expires_at",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
    size: 100,
    // "In 5 days", amber within a day, the bare date once expired.
    display: {
      type: "relative_date",
      label: "$page.settings.invites.column.expires",
      options: {
        soonWithinMs: DAY_MS,
        pastStyle: "day",
        pastTone: "dimmed",
      },
    },
  })
  @Access(AccessMode.ReadOnly)
  declare expiresAt: Date;

  @Listable()
  @Access(AccessMode.ReadOnly)
  declare invitedBy: string | null;

  /** Name of the user who sent the invitation, shown next to its date. */
  @Listable(["invitedBy"])
  @Joined({ table: User, localKey: "invitedBy", remoteField: "name" })
  declare invitedByName: string | null;

  @Listable(["expiresAt"])
  @Exported()
  @Column({
    name: "$page.settings.invites.column.status",
    type: new StatusType({
      onlineLabel: "$page.settings.invites.status.pending",
      offlineLabel: "$page.settings.invites.status.expired",
      onlineColor: "warning",
      offlineColor: "neutral",
    }),
    size: 100,
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
const inviteApiTarget = (action: string) =>
  `${INVITES_PAGE_PATH}/{_id}/${action}`;

// Pending invitations only: an expired one can be resent or removed.
const PENDING = { field: "status", equals: true } as const;
const EXPIRED = { field: "status", equals: false } as const;

// Reached from the members page rather than the settings menu: nested under
// it, so its URL and breadcrumb go through Members. The permission keeps the
// id it had as a user-category page, so the roles that already grant it are
// unchanged.
@RegisterPage()
export class InvitesSettingsController extends PageController(
  "invites",
  {
    displayName: "$menu.invites",
    category: MembersSettingsController,
    permission: { id: INVITES_PERMISSION_ID },
    hidden: true,
    icon: "i-ph-envelope-simple",
    description: "$page.settings.description.invites",
  },
  DefaultLayout({ headerActions: [MEMBER_INVITE_HEADER_ACTION] }),
) {
  static table = TableView(inviteSettingDataAPI, {
    caption: "$page.settings.invites.table.caption",
    labelKey: "email",
    formTexts: memberListFormTexts("invites"),
    chrome: MEMBER_LISTS_CHROME,
    searchPlaceholder: "$page.settings.invites.search",
    quickFilters: [{ field: "roles_ids", ...ROLE_QUICK_FILTER }],
    // Drawn as the crown pill of the roles cell.
    hiddenColumns: ["asTenantOwner"],
    pageSize: MEMBER_LISTS_PAGE_SIZE,
    defaultSort: { field: "createdAt", desc: true },
    footer: {
      countLabel: "$page.settings.invites.footer_count",
      hint: "$page.settings.invites.expiry_hint",
    },
    tabs: [
      {
        id: "members",
        label: "$page.settings.members.tabs.members",
        icon: MEMBERS_TAB_ICON,
        to: MembersSettingsController,
        countFrom: memberSettingDataAPI,
        badge: true,
      },
      {
        id: "all",
        label: "$page.settings.members.tabs.invites",
        icon: INVITES_TAB_ICON,
      },
    ],
    // Modules edit the data they attached through `RegisterInviteExtension`
    // here, until the invitee accepts.
    formSlots: { edit: INVITE_EDIT_FORM_SLOT_ID },
    customButtons: [
      {
        id: MEMBER_INVITE_BUTTON_ID,
        label: "$page.settings.members.invite.button",
        icon: "i-ph-user-plus",
        color: "primary",
        permission: membersTableAddAction,
        // Pressed from the page header.
        hidden: true,
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
      edit: {
        isEnabled: true,
        isVisible: true,
        rule: PENDING,
        label: "$page.settings.invites.action.edit",
        icon: "i-ph-pencil-simple",
      },
      hasSelection: false,
      custom: [
        {
          label: "$page.settings.invites.action.resend",
          icon: "i-ph-paper-plane-tilt",
          isVisible: true,
          showLabel: true,
          variant: ButtonVariant.outline,
          target: {
            type: "api",
            url: inviteApiTarget("resend"),
            method: "POST",
            successMessage: "$page.settings.invites.action.resend_success",
            confirm: {
              title: "$page.settings.invites.action.resend_confirm_title",
              description:
                "$page.settings.invites.action.resend_confirm_description",
              confirmColor: "primary",
              icon: "i-ph-paper-plane-tilt",
              confirmLabel: "$page.settings.invites.action.resend",
            },
          },
        },
        {
          label: "$page.settings.invites.action.copy_link",
          icon: "i-ph-link",
          isVisible: true,
          showLabel: true,
          rule: PENDING,
          target: {
            type: "api",
            url: inviteApiTarget("link"),
            method: "GET",
            copy: "url",
            successMessage: "$page.settings.invites.action.copy_link_success",
          },
        },
        {
          label: "$page.settings.invites.action.revoke",
          isVisible: true,
          showLabel: true,
          color: "error",
          rule: PENDING,
          target: {
            type: "api",
            url: inviteApiTarget("cancel"),
            method: "DELETE",
            successMessage: "$page.settings.invites.action.revoke_success",
            confirm: {
              title: "$page.settings.invites.action.revoke_confirm_title",
              description:
                "$page.settings.invites.action.revoke_confirm_description",
              confirmColor: "error",
              icon: "i-ph-envelope-simple-open",
              confirmLabel: "$page.settings.invites.action.revoke",
            },
          },
        },
        {
          label: "$page.settings.invites.action.remove",
          isVisible: true,
          showLabel: true,
          color: "error",
          rule: EXPIRED,
          target: {
            type: "api",
            url: inviteApiTarget("cancel"),
            method: "DELETE",
            successMessage: "$page.settings.invites.action.remove_success",
            confirm: {
              title: "$page.settings.invites.action.remove_confirm_title",
              description:
                "$page.settings.invites.action.remove_confirm_description",
              confirmColor: "error",
              icon: "i-ph-envelope-simple-open",
              confirmLabel: "$page.settings.invites.action.remove",
            },
          },
        },
      ],
    },
  });

  @Post("/:id/resend")
  resendInvite(
    @Parameter("id", "param") id: string,
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(InvitesSettingsController) user: User,
  ): Promise<InviteEmailOutcome> {
    return resendPendingInvite(getRequestTenantId(ctx), id, {
      name: user.name,
      userId: user._id,
    });
  }

  @Get("/:id/link")
  async inviteLink(
    @Parameter("id", "param") id: string,
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(InvitesSettingsController) _user: User,
  ): Promise<InviteLinkResponse> {
    const invite = await loadInviteForAction(getRequestTenantId(ctx), id);
    assert(invite, HTTP_NOT_FOUND, INVITE_NOT_FOUND);
    assert(
      new Date(invite.expiresAt) > new Date(),
      HTTP_GONE,
      "$page.settings.invites.error.expired",
    );
    const url = buildAdminInviteSignupLink(getClientBaseUrl() ?? "", {
      email: invite.email,
      token: invite.token,
      inviteeName: inviteeDisplayName(invite.firstname, invite.lastname),
      language: invite.language,
    });
    return { url };
  }

  @Delete("/:id/cancel")
  async cancelInvite(
    @Parameter("id", "param") id: string,
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(InvitesSettingsController) _user: User,
  ) {
    const tenantId = getRequestTenantId(ctx);
    const existingInvite = await loadInviteForAction(tenantId, id);
    assert(existingInvite, HTTP_NOT_FOUND, INVITE_NOT_FOUND);

    const resolution = await decideInvite({
      tenantId,
      invite: existingInvite,
      reason: "cancelled",
    });
    await completeInviteResolution(resolution);
  }
}
