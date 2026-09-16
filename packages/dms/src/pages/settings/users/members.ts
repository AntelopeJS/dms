import {
  Context,
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
  type TenantMember,
  TenantMemberModel,
} from "@antelopejs/interface-dms/db";
import { AuthUserWithPermission } from "@antelopejs/interface-dms/guards";
import { ExecuteHooks, Hook } from "@antelopejs/interface-dms/hooks";
import { CollectInviteExtensionPayloads } from "@antelopejs/interface-dms/invite-extensions";
import { inviteUserToTenant } from "@antelopejs/interface-dms/invites";
import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import {
  clearPlatformOwnerOnMemberRemoval,
  syncPlatformOwnerOnTenantOwnerChange,
} from "@antelopejs/interface-dms/tenant-ownership";
import { type User, UserModel } from "@antelopejs/interface-dms/auth/db";
import { TableView } from "@antelopejs/interface-dms/base";
import { isSaasMode } from "@antelopejs/interface-dms/utils/saas-mode";
import { memberInviteSchema } from "../../../validation/member-invite.schema";
import { userCategory } from "./category";
import { memberInviteForm } from "./member-invite-form";

RegisterDataController()(memberSettingDataAPI);

// Redirect targets for the invite form: an existing user is added straight to
// the members list, a new email lands as a pending invite.
const MEMBERS_PAGE_PATH = "/settings/user/members";
const INVITES_PAGE_PATH = "/settings/user/invites";

type OwnerChange = "promote" | "demote" | null;

function detectOwnerChange(
  current: TenantMember,
  body: { isTenantOwner?: boolean },
): OwnerChange {
  if (body.isTenantOwner === undefined) return null;
  if (current.isTenantOwner === body.isTenantOwner) return null;
  return body.isTenantOwner ? "promote" : "demote";
}

async function assertNotLastTenantOwner(
  tenantId: string,
  current: TenantMember,
): Promise<void> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const remaining = await memberModel.countOwnersExcluding([current.userId]);
  assert(remaining > 0, 409, "$page.settings.members.error.last_owner");
}

async function assertNotLastPlatformOwnerOnDelete(
  targets: TenantMember[],
): Promise<void> {
  const userModel = GetModel(UserModel);
  const removedOwnerUserIds = targets
    .filter((target) => target.isTenantOwner === true)
    .map((target) => target.userId);
  if (removedOwnerUserIds.length === 0) return;
  const remaining = await userModel.countOwnersExcluding(removedOwnerUserIds);
  assert(remaining > 0, 409, "$page.settings.members.error.last_owner_delete");
}

async function assertNotAlreadyMember(
  tenantId: string,
  userId: string,
): Promise<void> {
  const memberModel = GetModel(TenantMemberModel, tenantId);
  const existing = await memberModel.getByUser(userId);
  assert(!existing, 409, "$page.settings.members.invite.already_member");
}

export const membersTable = TableView(memberSettingDataAPI, {
  caption: "$page.settings.members.table.caption",
  labelKey: "name",
  rowActions: {
    add: false,
    copyLink: true,
    delete: { isEnabled: true, isVisible: true },
    details: true,
    duplicate: false,
    edit: { isEnabled: true, isVisible: true },
    hasSelection: true,
    custom: [
      {
        label: "$page.settings.members.action.validate_email",
        icon: "i-ph-check-circle",
        target: {
          type: "api",
          url: "/settings/user/members/{_id}/validate-email",
          method: "POST",
          successMessage:
            "$page.settings.members.action.validate_email_success",
          confirm: {
            title: "$page.settings.members.action.validate_email_confirm_title",
            description:
              "$page.settings.members.action.validate_email_confirm_description",
            confirmColor: "primary",
          },
        },
        rule: { field: "isValidated", notEquals: true },
      },
    ],
  },
  customButtons: [
    {
      label: "$page.settings.members.invite.button",
      icon: "i-ph-user-plus",
      color: "primary",
      permission: "add",
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
      const tenantId = getRequestTenantId(ctx);
      // The source and the target do not overlap, so this cannot be one
      // assertion: the value reaches here through a decorator, a JWT
      // payload or a filter tuple, none of which the type system sees.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions
      const currentRow = current as unknown as TenantMember;
      const editBody = body as { isTenantOwner?: boolean };
      const ownerChange = detectOwnerChange(currentRow, editBody);
      if (ownerChange === "demote") {
        await assertNotLastTenantOwner(tenantId, currentRow);
      }
      if (ownerChange !== null) {
        await syncPlatformOwnerOnTenantOwnerChange(
          GetModel(UserModel),
          currentRow.userId,
          tenantId,
          editBody.isTenantOwner === true,
        );
      }
    },
    delete: async (ctx, { ids }) => {
      const tenantId = getRequestTenantId(ctx);
      const memberModel = GetModel(TenantMemberModel, tenantId);
      const targets = await Promise.all(ids.map((id) => memberModel.get(id)));
      const tenantTargets = targets.filter((m): m is TenantMember => !!m);
      const excludedUserIds = tenantTargets.map((m) => m.userId);
      const remaining = await memberModel.countOwnersExcluding(excludedUserIds);
      assert(
        remaining > 0,
        409,
        "$page.settings.members.error.last_owner_delete",
      );
      if (!isSaasMode()) {
        await assertNotLastPlatformOwnerOnDelete(tenantTargets);
      }
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
    },
  },
});

function requireMembersTableAddAction(): Action {
  const action = membersTable.getAction("add");
  if (!action) {
    throw new Error("Members table is expected to register an 'add' action");
  }
  return action;
}

export const membersTableAddAction = requireMembersTableAddAction();

@RegisterPage()
export class MembersSettingsController extends PageController("members", {
  displayName: "$menu.members",
  category: userCategory,
  icon: "i-ph-users-three",
  order: 4,
  description: "$page.settings.description.members",
}) {
  static table = membersTable;

  @Post("/invite")
  async invite(
    @Context() ctx: RequestContext,
    @AuthUserWithPermission(membersTableAddAction) _user: User,
    @Model(UserModel) userModel: UserModel,
    @JSONBody() body: unknown,
  ) {
    const tenantId = getRequestTenantId(ctx);
    const {
      email,
      firstname,
      lastname,
      roles,
      language,
      asTenantOwner,
      skipEmailValidation,
    } = assertValidation(body, (v) => memberInviteSchema.parse(v));
    // Validated before the invite exists: a payload a module refuses must not
    // leave a half-populated invitation behind.
    const extensions = CollectInviteExtensionPayloads(body);
    const roleIds = roles ?? [];
    const existingUser = await userModel.getByEmail(email);
    if (existingUser) {
      await assertNotAlreadyMember(tenantId, existingUser._id);
    }
    const result = await inviteUserToTenant({
      tenantId,
      email,
      firstname,
      lastname,
      language,
      roleIds,
      asTenantOwner,
      skipEmailValidation,
      sendEmail: true,
      extensions,
    });
    // An existing user is added straight away (no pending invite), so send the
    // admin to the members list rather than the empty invites list.
    return {
      redirectPath:
        result.kind === "added" ? MEMBERS_PAGE_PATH : INVITES_PAGE_PATH,
    };
  }

  @Post("/:id/validate-email")
  async validateMemberEmail(
    @Context() ctx: RequestContext,
    @Parameter("id", "param") memberId: string,
    @Model(UserModel) userModel: UserModel,
  ) {
    const tenantId = getRequestTenantId(ctx);
    const memberModel = GetModel(TenantMemberModel, tenantId);
    const member = await memberModel.get(memberId);
    assert(member, 404, "$page.settings.members.error.user_not_found");
    const user = await userModel.get(member.userId);
    assert(user, 404, "$page.settings.members.error.user_not_found");
    user.isValidated = true;
    user.validationToken = null;
    user.validationRequestedAt = null;
    await userModel.update(user);
  }
}
