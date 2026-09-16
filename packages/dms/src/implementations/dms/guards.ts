import { type ControllerClass, HTTPResult } from "@antelopejs/interface-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import {
  Action,
  type ComponentTargetInput,
} from "@antelopejs/interface-dms/component";
import { RoleModel, TenantMemberModel } from "@antelopejs/interface-dms/db";
import type { TenantGuardOptions } from "@antelopejs/interface-dms/guards";
import { GetPermissionId } from "@antelopejs/interface-dms/page";
import {
  GetEffectiveUserPermissions,
  HasPermission,
} from "@antelopejs/interface-dms/permissions";
import { AssertTenantAccess } from "@antelopejs/interface-dms/tenant-access";
import type { TenantTokenInput } from "@antelopejs/interface-dms/auth";
import { internal as authInternal } from "../dms-auth";

const HTTP_FORBIDDEN_STATUS = 403;

function forbiddenMissingPermission(permissionId: string): HTTPResult {
  return new HTTPResult(
    HTTP_FORBIDDEN_STATUS,
    `Forbidden: missing permission ${permissionId}`,
  );
}

export namespace internal {
  export const AuthUserWithPermissionValidator = async (
    target: ComponentTargetInput | ControllerClass | Action,
    data: TenantTokenInput,
    options?: TenantGuardOptions,
  ) => {
    const user = await authInternal.AuthUserValidator(data);
    if (!user) {
      return false;
    }

    // The gate applies even when the target carries no permission id: any
    // surface guarded by @AuthUserWithPermission is a tenant product surface.
    // Opting out leaves the permission check below untouched.
    if (data.tenantId && !options?.bypassTenantAccessGate) {
      await AssertTenantAccess(user._id, data.tenantId);
    }

    const permissionId =
      target instanceof Action ? target.permissionId : GetPermissionId(target);
    if (!permissionId) {
      return user;
    }

    const { tenantId } = data;
    if (!tenantId) {
      // A permission can only be granted within a tenant: a token without a
      // tenant claim cannot hold the required permission.
      throw forbiddenMissingPermission(permissionId);
    }
    const roleModel = GetModel(RoleModel, tenantId);
    const memberModel = GetModel(TenantMemberModel, tenantId);
    const member = await memberModel.getByUser(user._id);
    const roleIds = member?.roleIds ?? [];
    const permissions = await GetEffectiveUserPermissions(
      user,
      tenantId,
      roleIds,
      roleModel,
    );
    if (await HasPermission(permissions, permissionId)) {
      return user;
    }

    // Throw (never return false): a boolean result from an auth validator is
    // injected as the parameter value instead of failing the request, so the
    // documented 403 must be raised here (same shape as table-view's
    // authorizeAction and AssertTenantAccess).
    throw forbiddenMissingPermission(permissionId);
  };
}
