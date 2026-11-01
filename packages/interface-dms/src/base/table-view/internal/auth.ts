import type { RequestContext } from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { Logging } from "@antelopejs/interface-core/logging";
import type {
  DataControllerCallback,
  DataControllerCallbackWithOptions,
  DataControllerInstance,
} from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { RoleModel, TenantMemberModel } from "../../../db";
import {
  GetEffectiveUserPermissions,
  HasAnyPermission,
} from "../../../permissions";
import { getRequestTenantId } from "../../../request-tenant";
import { AssertTenantAccess } from "../../../tenant-access";
import { AuthUser } from "../../../auth";
import type { User } from "../../../auth/db";
import { getTableViewMetaFor } from "./meta";

/**
 * The read actions of a table view, named once so the route that checks one,
 * the builder that declares it and the gate-bypass list below can never drift
 * apart — a rename that reached only two of the three would quietly take the
 * recovery surface down.
 *
 * @internal
 */
export const VIEW_ACTION = "view";
/** @internal */
export const LIST_ACTION = "list";
/** @internal */
export const SELECT_ACTION = "select";
/** @internal */
export const VIEW_ARCHIVED_ACTION = "viewArchived";

/**
 * The actions a `bypassTenantAccessGate` table view may still serve while a
 * gate denies the tenant: reading its rows, and nothing else.
 *
 * `export` is deliberately out — it queues a job and delivers a file, which is
 * a side effect on a tenant the product has been shut off for, not a read of
 * the recovery surface.
 *
 * @internal Read by the tests that check this list against the actions a
 * real table view declares.
 */
export const GATE_BYPASSABLE_ACTIONS = [
  VIEW_ACTION,
  LIST_ACTION,
  SELECT_ACTION,
];

function isGateBypassableAction(
  actionId: string,
  permissionIds: string[],
): boolean {
  return permissionIds.length > 0 && GATE_BYPASSABLE_ACTIONS.includes(actionId);
}

/** @internal */
export async function authorizeAction(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- The published authorization helper accepts a dispatcher-bound controller receiver without a class validation step.
  thisObj: unknown,
  actionId: string,
  user: User,
  tenantId: string,
): Promise<Set<string> | undefined> {
  const meta = getTableViewMetaFor(thisObj);
  const permissionIds = meta.actionPermissionIds(actionId);
  if (
    !meta.bypassTenantAccessGate ||
    !isGateBypassableAction(actionId, permissionIds)
  ) {
    if (meta.bypassTenantAccessGate) {
      Logging.Trace(
        `[DMS] Action "${actionId}" of a bypassTenantAccessGate table view is not a permission-carrying read: the tenant access gate applies to it.`,
      );
    }
    await AssertTenantAccess(user._id, tenantId);
  }
  if (permissionIds.length === 0) {
    return undefined;
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
  if (await HasAnyPermission(permissions, permissionIds)) {
    return permissions;
  }
  throwHttpAssert(
    false,
    403,
    `Forbidden: missing permission ${permissionIds.join(" or ")}`,
  );
}

/**
 * `baseRoute` behind the permission check of `actionId`: the route takes the
 * user after the arguments of `baseRoute`, and runs `baseRoute` only once the
 * user holds the permission.
 *
 * @internal
 */
export function withActionCheck<O, R, P, B>(
  actionId: string,
  baseRoute: DataControllerCallback<O, R, [RequestContext, P, B]>,
): DataControllerCallback<O, R, [RequestContext, P, B, User]> {
  return {
    method: baseRoute.method,
    args: [...baseRoute.args, AuthUser()],
    func: async function (
      this: DataControllerInstance,
      ctx: RequestContext,
      params: P,
      body: B,
      user: User,
    ) {
      await authorizeAction(this, actionId, user, getRequestTenantId(ctx));
      return baseRoute.func.call(this, ctx, params, body);
    },
  };
}

/**
 * {@link withActionCheck} for a route taking only the request context and its
 * parameters, such as `get`.
 *
 * @internal
 */
export function withParamsActionCheck<O, R, P>(
  actionId: string,
  baseRoute: DataControllerCallback<O, R, [RequestContext, P]>,
): DataControllerCallback<O, R, [RequestContext, P, User]> {
  return {
    method: baseRoute.method,
    args: [...baseRoute.args, AuthUser()],
    func: async function (
      this: DataControllerInstance,
      ctx: RequestContext,
      params: P,
      user: User,
    ) {
      await authorizeAction(this, actionId, user, getRequestTenantId(ctx));
      return baseRoute.func.call(this, ctx, params);
    },
  };
}

/** @internal */
export function withActionCheckOptions<O, R, P, B>(
  actionId: string,
  baseRoute: DataControllerCallbackWithOptions<O, R, [RequestContext, P, B]>,
): DataControllerCallbackWithOptions<O, R, [RequestContext, P, B, User]> {
  return {
    endpoint: baseRoute.endpoint,
    options: baseRoute.options,
    callback: withActionCheck(actionId, baseRoute.callback),
  };
}
