import {
  Context,
  Controller,
  Get,
  Post,
  type RequestContext,
} from "@antelopejs/interface-api";
import type { KeyValueListItem } from "@antelopejs/interface-dms/base";
import { GetApiBaseUrl } from "@antelopejs/interface-dms/api-base-url";
import { AuthUser } from "@antelopejs/interface-dms/auth";
import type { User } from "@antelopejs/interface-dms/auth/db";
import { GetClientBaseUrl } from "@antelopejs/interface-dms/client-base-url";
import { getClientIp } from "@antelopejs/interface-dms/client-ip";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import { NotifyMenuChanged } from "@antelopejs/interface-dms/page";
import {
  GetEffectiveUserPermissions,
  HasAnyPermission,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import { getRequestTenantId } from "@antelopejs/interface-dms/request-tenant";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  CHARTS_PERMISSION_PREFIX,
  EXPORT_REPORTS_PERMISSION_ID,
  isOnFreePlan,
  toggleFreePlan,
} from "./registrations";

export const PERMISSIONS_DEMO_API = "/api/playground/permissions";
const UNSET = "(not set)";
const CHARTS_DASHBOARD_ID = `${CHARTS_PERMISSION_PREFIX}.chart-dashboard`;

interface ItemsResponse {
  items: KeyValueListItem[];
}

function grantItem(label: string, granted: boolean): KeyValueListItem {
  return {
    label,
    value: granted ? "Granted" : "Refused",
    type: "status",
    tone: granted ? "success" : "neutral",
  };
}

async function effectivePermissions(
  user: User,
  tenantId: string,
): Promise<Set<string>> {
  const member = await GetModel(TenantMemberModel, tenantId).getByUser(
    user._id,
  );
  return GetEffectiveUserPermissions(
    { _id: user._id, owner: member?.isTenantOwner },
    tenantId,
    member?.roleIds ?? [],
    GetModel(RoleModel, tenantId),
  );
}

export class PermissionsDemoController extends Controller(
  PERMISSIONS_DEMO_API,
) {
  @Get("me")
  async me(
    @Context() ctx: RequestContext,
    @AuthUser() user: User,
  ): Promise<ItemsResponse> {
    const tenantId = getRequestTenantId(ctx);
    const permissions = await effectivePermissions(user, tenantId);
    return {
      items: [
        {
          label: "GetEffectiveUserPermissions",
          value: permissions.has("*") ? "* (owner)" : `${permissions.size} ids`,
          type: "mono",
        },
        grantItem(
          `HasPermission("${EXPORT_REPORTS_PERMISSION_ID}")`,
          await HasPermission(permissions, EXPORT_REPORTS_PERMISSION_ID),
        ),
        grantItem(
          `HasPermission("${CHARTS_DASHBOARD_ID}")`,
          await HasPermission(permissions, CHARTS_DASHBOARD_ID),
        ),
        grantItem(
          "HasAnyPermission([export, charts dashboard])",
          await HasAnyPermission(permissions, [
            EXPORT_REPORTS_PERMISSION_ID,
            CHARTS_DASHBOARD_ID,
          ]),
        ),
        grantItem("Free plan resolver active", isOnFreePlan(tenantId)),
      ],
    };
  }

  @Post("free-plan/toggle")
  async toggleFreePlan(
    @Context() ctx: RequestContext,
    @AuthUser() _user: User,
  ): Promise<{ free: boolean }> {
    const tenantId = getRequestTenantId(ctx);
    const free = toggleFreePlan(tenantId);
    await NotifyMenuChanged(tenantId);
    return { free };
  }

  @Post("export")
  export(@AuthUser() _user: User): { exported: boolean } {
    return { exported: true };
  }

  /** What a module learns about the request and the deployment. */
  @Get("environment")
  async environment(
    @Context() ctx: RequestContext,
    @AuthUser() _user: User,
  ): Promise<ItemsResponse> {
    return {
      items: [
        {
          label: "GetApiBaseUrl()",
          value: (await GetApiBaseUrl()) ?? UNSET,
          type: "mono",
        },
        {
          label: "GetClientBaseUrl()",
          value: (await GetClientBaseUrl()) ?? UNSET,
          type: "mono",
        },
        {
          label: "getClientIp(ctx)",
          value: await getClientIp(ctx),
          type: "mono",
        },
        {
          label: "getRequestTenantId(ctx)",
          value: getRequestTenantId(ctx),
          type: "mono",
        },
      ],
    };
  }
}
