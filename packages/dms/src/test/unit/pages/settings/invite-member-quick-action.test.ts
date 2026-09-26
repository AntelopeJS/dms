import { GetMetadata, ImplementInterface } from "@antelopejs/interface-core";
import { expect } from "chai";
import {
  PageMetadata,
  internal as pageInterfaceInternal,
} from "@antelopejs/interface-dms/page";
import * as permissionsInterface from "@antelopejs/interface-dms/permissions";
import * as permissionsResolverInterface from "@antelopejs/interface-dms/permissions-resolver";
import { internal as quickActionsInterface } from "@antelopejs/interface-dms/quick-actions";
import * as tenantAccessInterface from "@antelopejs/interface-dms/tenant-access";
import type { User } from "@antelopejs/interface-dms/auth/db";
import {
  buildSiteLayoutPayload,
  internal as pageImplInternal,
} from "../../../../implementations/dms/page";
import * as permissionsImpl from "../../../../implementations/dms/permissions";
import * as permissionsResolverImpl from "../../../../implementations/dms/permissions-resolver";
import * as quickActionsImpl from "../../../../implementations/dms/quick-actions";
import * as tenantAccessImpl from "../../../../implementations/dms/tenant-access";
import {
  MEMBER_INVITE_BUTTON_ID,
  MembersSettingsController,
  membersTableAddAction,
} from "../../../../pages/settings/users/members";
import { inviteMemberQuickAction } from "../../../../pages/settings/users/quick-actions";
import { stubPageAccessModels } from "../../../helpers/page-access";

const ACTION_KEY = `${inviteMemberQuickAction.category.id}:${inviteMemberQuickAction.id}`;
const TENANT_ID = "invite-quick-action-tenant";

function membersPagePermission(): string {
  const pageInfo = GetMetadata(
    MembersSettingsController,
    PageMetadata,
  ).pageInfo;
  if (!pageInfo) {
    throw new Error("The members page is not registered");
  }
  return pageInfo.fullId;
}

function invitePermission(): string {
  const permissionId = membersTableAddAction.permissionId;
  if (!permissionId) {
    throw new Error("The members table add action has no permission id");
  }
  return permissionId;
}

async function actionsFor(
  grantedPermissions: string[],
): Promise<Record<string, unknown>> {
  const { memberModel, roleModel } = stubPageAccessModels(grantedPermissions);
  const payload = await buildSiteLayoutPayload(
    { _id: "invite-quick-action-member" } as User,
    memberModel,
    roleModel,
    TENANT_ID,
  );
  return payload.quickActions.actions;
}

describe("[unit] pages/settings/users/quick-actions — invite a member", () => {
  before(() => {
    ImplementInterface(permissionsInterface, permissionsImpl);
    ImplementInterface(permissionsResolverInterface, permissionsResolverImpl);
    ImplementInterface(tenantAccessInterface, tenantAccessImpl);
    ImplementInterface(pageInterfaceInternal, pageImplInternal);
    ImplementInterface(quickActionsInterface, quickActionsImpl.internal);
  });

  it("presses the members table's invite button", async () => {
    const actions = await actionsFor([
      membersPagePermission(),
      invitePermission(),
    ]);

    expect(actions[ACTION_KEY]).to.deep.include({
      displayName: "$quickActions.invite_member",
      target: {
        type: "button",
        to: "/settings/user/members",
        component: "table",
        button: MEMBER_INVITE_BUTTON_ID,
      },
    });
  });

  it("is left out for a member who sees the members page but cannot invite", async () => {
    const actions = await actionsFor([membersPagePermission()]);

    expect(actions).to.not.have.property(ACTION_KEY);
  });

  it("is left out for a caller who cannot reach the members page", async () => {
    const actions = await actionsFor([]);

    expect(actions).to.not.have.property(ACTION_KEY);
  });
});
