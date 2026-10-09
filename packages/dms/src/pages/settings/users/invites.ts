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
import { INVITE_EDIT_FORM_SLOT_ID } from "@antelopejs/interface-dms/invite-extensions/internal/form-slot";
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
  DefaultDisplays,
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
import { DASHBOARD_LANGUAGE_ITEMS } from "./dashboard-languages";
import { memberInviteForm } from "./member-invite-form";
import {
  INVITES_PAGE_PATH,
  INVITES_PERMISSION_ID,
  INVITES_TAB_ICON,
  MEMBER_INVITE_BUTTON_ID,
  MEMBER_LISTS_LAYOUT,
  memberListFormPages,
  MEMBER_LISTS_PAGE_SIZE,
  MEMBERS_TAB_ICON,
  MembersSettingsController,
  membersTableAddAction,
  ROLE_QUICK_FILTER,
} from "./members";
import { editRolePicker } from "./member-roles-field";
import { declarePermissionWarning } from "./permission-warnings";
import { type InviteRoleOptions, loadRoleOptions } from "./member-role-options";

const DAY_MS = 24 * 60 * 60 * 1000;
const HTTP_NOT_FOUND = 404;
const HTTP_GONE = 410;
const INVITE_NOT_FOUND = "$page.settings.invites.error.not_found";
/** Roles the invitation's edit form offers, a route of the invites page. */
const INVITE_ROLE_OPTIONS_URL = `${INVITES_PAGE_PATH}/role-options`;

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
    // Gives the status pill its room within the table's width budget.
    size: 172,
    display: new DefaultDisplays.IdentityDisplay({
      icon: "i-ph-envelope-simple",
    }),
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
    // The pills of the members' "Change roles" form, not a relation picker:
    // its "add" entry would create a role outside the roles editor.
    inputComponent: editRolePicker({
      rolesUrl: INVITE_ROLE_OPTIONS_URL,
      ownerField: "asTenantOwner",
    }),
    filterable: true,
    size: 130,
    display: new DefaultDisplays.PillsDisplay({
      exclusive: {
        field: "asTenantOwner",
        label: "$page.settings.members.owner",
        icon: "i-ph-crown",
      },
      emptyLabel: "$page.settings.members.no_role",
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare roles_ids: string[];

  @Listable()
  @Exported()
  @Column({
    name: "$page.settings.invites.column.owner",
    type: new DefaultDataTypes.BooleanType(),
    // Drawn as the crown pill of the roles cell.
    isVisible: false,
  })
  @Access(AccessMode.ReadWrite)
  declare asTenantOwner: boolean;

  @Exported()
  @Column({
    name: "$page.settings.invites.column.language",
    type: new DefaultDataTypes.SelectType({
      items: DASHBOARD_LANGUAGE_ITEMS,
    }),
  })
  @Access(AccessMode.ReadWrite)
  declare language: string;

  @Listable()
  @Exported()
  @Sortable()
  @Column({
    name: "$page.settings.invites.column.sent",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
    size: 120,
    display: new DefaultDisplays.RelativeDateDisplay({
      style: "day",
      tone: "dimmed",
      byField: "invitedByName",
      byLabel: "$page.settings.invites.sent_by",
    }),
  })
  @Access(AccessMode.ReadOnly)
  declare createdAt: Date;

  @Listable()
  @Exported()
  @Column({
    name: "$page.settings.invites.column.expires",
    type: new DefaultDataTypes.DateType(),
    readonlyBehavior: {
      edit: ReadonlyBehaviorType.disabled,
      view: ReadonlyBehaviorType.disabled,
      new: ReadonlyBehaviorType.hidden,
    },
    size: 90,
    // "In 5 days", amber within a day, the bare date once expired.
    display: new DefaultDisplays.RelativeDateDisplay({
      soonWithinMs: DAY_MS,
      pastStyle: "day",
      pastTone: "dimmed",
    }),
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
    // Room for the longest pill, the French "En attente" (98px), beside the
    // cell's 28px of gutters.
    size: 128,
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

// Nested under Members: its URL and breadcrumb go through Members, and the
// settings navigation lists it right after Members.
@RegisterPage()
export class InvitesSettingsController extends PageController("invites", {
  displayName: "$page.settings.shell.member_invitations",
  category: MembersSettingsController,
  permission: { id: INVITES_PERMISSION_ID },
  icon: "i-ph-envelope-simple",
  description: "$page.settings.description.invites",
}) {
  static table = TableView(inviteSettingDataAPI, {
    caption: "$page.settings.invites.table.caption",
    labelKey: "email",
    // "Edit invitation" opens over the list, like the members' "Change
    // roles": the address in the title, the roles as the invite form's pills.
    formContainer: {
      type: "modal",
      size: "md",
      pages: memberListFormPages("invites"),
    },
    layout: MEMBER_LISTS_LAYOUT,
    searchPlaceholder: "$page.settings.invites.search",
    quickFilters: [{ field: "roles_ids", ...ROLE_QUICK_FILTER }],
    pageSize: MEMBER_LISTS_PAGE_SIZE,
    defaultSort: { field: "createdAt", desc: true },
    footer: {
      countLabel: "$page.settings.invites.footer_count",
    },
    tabs: [
      {
        id: "members",
        label: "$page.settings.members.tabs.members",
        icon: MEMBERS_TAB_ICON,
        to: MembersSettingsController,
        countFrom: memberSettingDataAPI,
      },
      {
        id: "all",
        label: "$page.settings.members.tabs.invites",
        icon: INVITES_TAB_ICON,
        navBadge: true,
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
        placement: "header",
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
          },
          confirm: {
            title: "$page.settings.invites.action.resend_confirm_title",
            description:
              "$page.settings.invites.action.resend_confirm_description",
            color: "primary",
            icon: "i-ph-paper-plane-tilt",
            confirmLabel: "$page.settings.invites.action.resend",
          },
        },
        // An icon (named, with its tooltip) rather than a label: with Resend
        // and Revoke labelled, the five columns fit the settings column of a
        // 1440px screen beside the actions, none hidden under them.
        {
          label: "$page.settings.invites.action.copy_link",
          icon: "i-ph-link",
          isVisible: true,
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
          },
          confirm: {
            title: "$page.settings.invites.action.revoke_confirm_title",
            description:
              "$page.settings.invites.action.revoke_confirm_description",
            color: "error",
            icon: "i-ph-envelope-simple-open",
            confirmLabel: "$page.settings.invites.action.revoke",
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
          },
          confirm: {
            title: "$page.settings.invites.action.remove_confirm_title",
            description:
              "$page.settings.invites.action.remove_confirm_description",
            color: "error",
            icon: "i-ph-envelope-simple-open",
            confirmLabel: "$page.settings.invites.action.remove",
          },
        },
      ],
    },
  });

  @Get("/role-options")
  inviteRoleOptions(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(InvitesSettingsController) _user: User,
  ): Promise<InviteRoleOptions> {
    return loadRoleOptions(getRequestTenantId(ctx));
  }

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

const invitesTableEditAction =
  InvitesSettingsController.table.getAction("edit");
if (!invitesTableEditAction) {
  throw new Error("Invites table is expected to register an 'edit' action");
}
// Editing a pending invitation can give it any role or make the invitee an
// owner, like inviting (see the members table's add action).
declarePermissionWarning(
  invitesTableEditAction,
  "$page.settings.roles.warning.invites",
);
