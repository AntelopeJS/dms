import {
  Context,
  Get,
  JSONBody,
  Parameter,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import { assert, assertValidation } from "@antelopejs/interface-api-util";
import { RegisterDataController } from "@antelopejs/interface-data-api";
import { GetModel, Model } from "@antelopejs/interface-database-decorators";
import type { Action } from "@antelopejs/interface-dms/component";
import { memberSettingDataAPI } from "@antelopejs/interface-dms/data-controllers";
import {
  RoleModel,
  type TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { ExecuteHooks, Hook } from "@antelopejs/interface-dms/hooks";
import { internal } from "@antelopejs/interface-dms/invite-extensions";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { GetPermissions } from "@antelopejs/interface-dms/permissions";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { clearPlatformOwnerOnMemberRemoval } from "@antelopejs/interface-dms/tenant-ownership";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { TableView } from "@antelopejs/interface-dms/base";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import type { RowActionConfirmDescriptor } from "@antelopejs/interface-dms/base/table-view";
import { isSaasMode } from "@antelopejs/interface-dms/utils/saas-mode";
import { requestEmailVerification } from "../../../routes/auth/request-email-verification";
import { memberInviteSchema } from "../../../validation/member-invite.schema";
import { memberOwnershipSchema } from "../../../validation/member-ownership.schema";
import { userCategory } from "./category";
import {
  type InviteFormDefaults,
  memberInviteForm,
  resolveInviteLanguage,
} from "./member-invite-form";
import {
  batchFailure,
  countSuccessfulInvites,
  hasUndeliveredInviteEmail,
  type InviteEmailResult,
  inviteMembers,
  type MemberInviteNotice,
  inviteNotice,
} from "./member-invite-batch";
import {
  buildMemberRemovalImpact,
  type MemberRemovalImpact,
  memberRemovalConfirm,
  prepareOwnerChange,
  requireMember,
  setMemberOwnership,
} from "./member-management";
import {
  buildInviteRoleOptions,
  type InviteRoleOptions,
} from "./member-role-options";

RegisterDataController()(memberSettingDataAPI);

// Redirect targets for the invite form: an existing user is added straight to
// the members list, a new email lands as a pending invite.
export const MEMBERS_PAGE_PATH = "/settings/user/members";
export const INVITES_PAGE_PATH = `${MEMBERS_PAGE_PATH}/invites`;
/** Data API of the invitations list, whose total the Invitations tab shows. */
export const INVITES_API_LOCATION = "/api/tables/admin-invites";

export const MEMBER_INVITE_BUTTON_ID = "invite";

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const USER_NOT_FOUND = "$page.settings.members.error.user_not_found";

/**
 * Shown by the frontend in place of the success message: the invitations
 * exist, and the invites page the form lands on offers to resend them.
 */
export const INVITE_EMAIL_FAILED_WARNING =
  "$page.settings.members.invite.email_failed";

/** Permission of the invitations page, which the members page links to. */
export const INVITES_PERMISSION_ID = "settings.user.invites";

/**
 * The reduced grid both lists of the members page share: no caption (the page
 * header names it), the Members / Invitations link tabs up in the header band,
 * an open search field and a role filter, sortable headers, the row menu and a
 * footer with the count.
 */
export const MEMBER_LISTS_CHROME = "minimal";
export const MEMBER_LISTS_PAGE_SIZE = 25;
export const MEMBERS_TAB_ICON = "i-ph-users";
export const INVITES_TAB_ICON = "i-ph-envelope-simple";
export const ROLE_QUICK_FILTER = {
  label: "$page.settings.members.filter.role",
  allLabel: "$page.settings.members.filter.all_roles",
};

/** What an invite request answers. */
export interface MemberInviteResponse {
  results: InviteEmailResult[];
  redirectPath: string;
  /** Set when some addresses were skipped (already members, refused). */
  notice?: MemberInviteNotice;
  /** Set when an invitation was created but its email did not leave. */
  warning?: string;
}

/**
 * Outside SaaS mode the platform owners are the default tenant's owners, so
 * removing the last of them would leave the platform without one. In SaaS mode
 * tenant owners are customers and platform ownership is managed separately.
 */
export async function assertNotLastPlatformOwnerOnDelete(
  targets: TenantMember[],
): Promise<void> {
  if (await isSaasMode()) return;
  const userModel = GetModel(UserModel);
  const removedOwnerUserIds = targets
    .filter((target) => target.isTenantOwner === true)
    .map((target) => target.userId);
  if (removedOwnerUserIds.length === 0) return;
  const remaining = await userModel.countOwnersExcluding(removedOwnerUserIds);
  assert(
    remaining > 0,
    HTTP_CONFLICT,
    "$page.settings.members.error.last_owner_delete",
  );
}

async function guardMemberRemoval(tenantId: string, ids: string[]) {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const targets = await Promise.all(ids.map((id) => memberModel.get(id)));
  const tenantTargets = targets.filter((m): m is TenantMember => !!m);
  const excludedUserIds = tenantTargets.map((m) => m.userId);
  const remaining = await memberModel.countOwnersExcluding(excludedUserIds);
  assert(
    remaining > 0,
    HTTP_CONFLICT,
    "$page.settings.members.error.last_owner_delete",
  );
  await assertNotLastPlatformOwnerOnDelete(tenantTargets);
  const userModel = GetModel(UserModel);
  for (const target of tenantTargets) {
    await clearPlatformOwnerOnMemberRemoval(
      userModel,
      target.userId,
      tenantId,
      target.isTenantOwner,
    );
  }
  await ExecuteHooks(Hook.MEMBER_REMOVED, {
    tenantId,
    userIds: excludedUserIds,
  });
}

const memberApiTarget = (action: string) =>
  `${MEMBERS_PAGE_PATH}/{_id}/${action}`;

export const membersTable = TableView(memberSettingDataAPI, {
  caption: "$page.settings.members.table.caption",
  labelKey: "name",
  chrome: MEMBER_LISTS_CHROME,
  searchPlaceholder: "$page.settings.members.search_members",
  quickFilters: [{ field: "roleIds", ...ROLE_QUICK_FILTER }],
  // Drawn inside the member cell (address) and the roles cell (crown pill).
  hiddenColumns: ["email", "isTenantOwner"],
  pageSize: MEMBER_LISTS_PAGE_SIZE,
  defaultSort: { field: "name" },
  footer: {
    countLabel: "$page.settings.members.footer_count",
    hint: "$page.settings.members.last_active_hint",
  },
  tabs: [
    {
      id: "all",
      label: "$page.settings.members.tabs.members",
      icon: MEMBERS_TAB_ICON,
      badge: true,
    },
    {
      id: "invites",
      label: "$page.settings.members.tabs.invites",
      icon: INVITES_TAB_ICON,
      to: INVITES_PAGE_PATH,
      permission: INVITES_PERMISSION_ID,
      countFrom: INVITES_API_LOCATION,
    },
  ],
  rowActions: {
    add: false,
    copyLink: false,
    details: false,
    duplicate: false,
    hasSelection: false,
    edit: {
      isEnabled: true,
      label: "$page.settings.members.action.change_roles",
      icon: "i-ph-key",
    },
    // The server words the confirmation: what the member loses, or why the
    // last owner cannot go.
    delete: {
      isEnabled: true,
      label: "$page.settings.members.action.remove",
      icon: "i-ph-user-minus",
      confirmFrom: memberApiTarget("removal-confirm"),
      successMessage: "$page.settings.members.remove.success",
    },
    custom: [
      {
        label: "$page.settings.members.action.resend_verification",
        icon: "i-ph-paper-plane-tilt",
        permission: "edit",
        rule: { field: "isValidated", notEquals: true },
        target: {
          type: "api",
          url: memberApiTarget("resend-verification"),
          method: "POST",
          successMessage:
            "$page.settings.members.action.resend_verification_success",
        },
      },
      {
        label: "$page.settings.members.action.validate_email_menu",
        icon: "i-ph-seal-check",
        permission: "edit",
        rule: { field: "isValidated", notEquals: true },
        target: {
          type: "api",
          url: memberApiTarget("validate-email"),
          method: "POST",
          successMessage:
            "$page.settings.members.action.validate_email_success",
          confirm: {
            title: "$page.settings.members.action.validate_email_confirm_title",
            description:
              "$page.settings.members.action.validate_email_confirm_description",
            confirmColor: "primary",
            icon: "i-ph-seal-check",
            confirmLabel: "$page.settings.members.action.validate_email",
          },
        },
      },
      {
        label: "$page.settings.members.action.make_owner_menu",
        icon: "i-ph-crown",
        permission: "edit",
        rule: { field: "isTenantOwner", notEquals: true },
        target: {
          type: "api",
          url: memberApiTarget("owner"),
          method: "POST",
          body: { isTenantOwner: true },
          successMessage: "$page.settings.members.action.make_owner_success",
          confirm: {
            title: "$page.settings.members.action.make_owner_confirm_title",
            description:
              "$page.settings.members.action.make_owner_confirm_description",
            confirmColor: "primary",
            icon: "i-ph-crown",
            confirmLabel: "$page.settings.members.action.make_owner",
          },
        },
      },
      {
        label: "$page.settings.members.action.remove_owner_menu",
        icon: "i-ph-crown-simple",
        permission: "edit",
        rule: { field: "isTenantOwner", equals: true },
        target: {
          type: "api",
          url: memberApiTarget("owner"),
          method: "POST",
          body: { isTenantOwner: false },
          successMessage: "$page.settings.members.action.remove_owner_success",
          confirm: {
            title: "$page.settings.members.action.remove_owner_confirm_title",
            description:
              "$page.settings.members.action.remove_owner_confirm_description",
            confirmColor: "warning",
            icon: "i-ph-crown",
            confirmLabel: "$page.settings.members.action.remove_owner",
          },
        },
      },
    ],
  },
  customButtons: [
    {
      id: MEMBER_INVITE_BUTTON_ID,
      label: "$page.settings.members.invite.button",
      icon: "i-ph-user-plus",
      color: "primary",
      permission: "add",
      // Pressed from the page header and the invite quick action.
      hidden: true,
      availability: internal.ResolveInviteAvailability,
      target: {
        type: "modal",
        size: "lg",
        component: memberInviteForm,
        title: "$page.settings.members.invite.title",
        description: "$page.settings.members.invite.description",
      },
    },
  ],
  guards: {
    edit: async (ctx, { current, body }) => {
      // The source and the target do not overlap, so this cannot be one
      // assertion: the value reaches here through a decorator, a JWT
      // payload or a filter tuple, none of which the type system sees.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions
      const currentRow = current as unknown as TenantMember;
      const { isTenantOwner } = body as { isTenantOwner?: boolean };
      await prepareOwnerChange(
        getRequestTenantId(ctx),
        currentRow,
        isTenantOwner,
      );
    },
    delete: async (ctx, { ids }) => {
      await guardMemberRemoval(getRequestTenantId(ctx), ids);
    },
  },
});

function requireMembersTableAction(id: string): Action {
  const action = membersTable.getAction(id);
  if (!action) {
    throw new Error(`Members table is expected to register an '${id}' action`);
  }
  return action;
}

export const membersTableAddAction = requireMembersTableAction("add");
const membersTableEditAction = requireMembersTableAction("edit");
const membersTableDeleteAction = requireMembersTableAction("delete");

function inviteRedirectPath(results: InviteEmailResult[]): string {
  const hasPendingInvite = results.some(
    (result) => result.outcome === "invited",
  );
  // An existing user is added straight away (no pending invite), so send the
  // admin to the members list rather than the invites list.
  return hasPendingInvite ? INVITES_PAGE_PATH : MEMBERS_PAGE_PATH;
}

/** What the invite route answers for the results of its batch. */
export function memberInviteResponse(
  results: InviteEmailResult[],
): MemberInviteResponse {
  const response: MemberInviteResponse = {
    results,
    redirectPath: inviteRedirectPath(results),
    notice: inviteNotice(results),
  };
  if (hasUndeliveredInviteEmail(results)) {
    response.warning = INVITE_EMAIL_FAILED_WARNING;
  }
  return response;
}

/** The page header's "Invite members", pressing the table's invite button. */
export const MEMBER_INVITE_HEADER_ACTION = {
  id: MEMBER_INVITE_BUTTON_ID,
  button: MEMBER_INVITE_BUTTON_ID,
  label: "$page.settings.members.invite.header_button",
  icon: "i-ph-user-plus",
  color: "primary" as const,
};

@RegisterPage()
export class MembersSettingsController extends PageController(
  "members",
  {
    displayName: "$menu.members",
    category: userCategory,
    icon: "i-ph-users-three",
    order: 4,
    description: "$page.settings.description.members",
  },
  DefaultLayout({ headerActions: [MEMBER_INVITE_HEADER_ACTION] }),
) {
  static table = membersTable;

  @Get("/invite/defaults")
  inviteDefaults(
    @AuthUserWithPermission(membersTableAddAction) user: User,
  ): InviteFormDefaults {
    return { language: resolveInviteLanguage(user.language) };
  }

  @Get("/invite/roles")
  async inviteRoles(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(membersTableAddAction) _user: User,
  ): Promise<InviteRoleOptions> {
    const roles = await GetModel(RoleModel, getRequestTenantId(ctx)).getAll();
    return buildInviteRoleOptions(roles, await GetPermissions());
  }

  @Post("/invite")
  async invite(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(membersTableAddAction) user: User,
    @JSONBody() body: unknown,
  ): Promise<MemberInviteResponse> {
    const payload = assertValidation(body, (v) => memberInviteSchema.parse(v));
    // Validated before any invite exists: a payload a module refuses must not
    // leave a half-populated invitation behind.
    const extensions = internal.CollectInviteExtensionPayloads(body);
    const results = await inviteMembers(
      payload,
      { tenantId: getRequestTenantId(ctx), userId: user._id, name: user.name },
      extensions,
    );
    if (countSuccessfulInvites(results) === 0) throw batchFailure(results);
    return memberInviteResponse(results);
  }

  @Get("/:id/removal-impact")
  removalImpact(
    @Context() ctx: RequestContext,
    @Parameter("id", "param") memberId: string,
    @AuthUserWithPermission(membersTableDeleteAction) user: User,
  ): Promise<MemberRemovalImpact> {
    return buildMemberRemovalImpact(
      getRequestTenantId(ctx),
      memberId,
      user._id,
    );
  }

  @Get("/:id/removal-confirm")
  async removalConfirm(
    @Context() ctx: RequestContext,
    @Parameter("id", "param") memberId: string,
    @AuthUserWithPermission(membersTableDeleteAction) user: User,
  ): Promise<RowActionConfirmDescriptor> {
    return memberRemovalConfirm(
      await buildMemberRemovalImpact(
        getRequestTenantId(ctx),
        memberId,
        user._id,
      ),
    );
  }

  @Post("/:id/owner")
  async changeOwnership(
    @Context() ctx: RequestContext,
    @Parameter("id", "param") memberId: string,
    @AuthUserWithPermission(membersTableEditAction) _user: User,
    @JSONBody() body: unknown,
  ): Promise<void> {
    const { isTenantOwner } = assertValidation(body, (v) =>
      memberOwnershipSchema.parse(v),
    );
    await setMemberOwnership(getRequestTenantId(ctx), memberId, isTenantOwner);
  }

  @Post("/:id/resend-verification")
  async resendVerification(
    @Context() ctx: RequestContext,
    @Parameter("id", "param") memberId: string,
    @AuthUserWithPermission(membersTableEditAction) _user: User,
    @Model(UserModel) userModel: UserModel,
  ): Promise<void> {
    const member = await requireMember(getRequestTenantId(ctx), memberId);
    const user = await userModel.get(member.userId);
    assert(user, HTTP_NOT_FOUND, USER_NOT_FOUND);
    await requestEmailVerification(userModel, user);
  }

  @Post("/:id/validate-email")
  async validateMemberEmail(
    @Context() ctx: RequestContext,
    @Parameter("id", "param") memberId: string,
    @AuthUserWithPermission(membersTableEditAction) _user: User,
    @Model(UserModel) userModel: UserModel,
  ): Promise<void> {
    const member = await requireMember(getRequestTenantId(ctx), memberId);
    const user = await userModel.get(member.userId);
    assert(user, HTTP_NOT_FOUND, USER_NOT_FOUND);
    user.isValidated = true;
    user.validationToken = null;
    user.validationRequestedAt = null;
    await userModel.update(user);
  }
}
