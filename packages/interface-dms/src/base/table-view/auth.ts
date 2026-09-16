import type {
  ControllerClass,
  RequestContext,
} from "@antelopejs/interface-api";
import { assert as throwHttpAssert } from "@antelopejs/interface-api-util";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import type {
  DataControllerCallback,
  DataControllerCallbackWithOptions,
} from "@antelopejs/interface-data-api";
import { GetModel } from "@antelopejs/interface-database-decorators";
import { RoleModel, TenantMemberModel } from "../../db";
import { GetEffectiveUserPermissions, HasPermission } from "../../permissions";
import { getRequestTenantId } from "../../request-tenant";
import { AssertTenantAccess } from "../../tenant-access";
import { AuthUser } from "../../auth";
import type { User } from "../../auth/db";
import { TableViewMeta } from "./meta";

/**
 * The read actions of a table view, named once so the route that checks one,
 * the builder that declares it and the gate-bypass list below can never drift
 * apart — a rename that reached only two of the three would quietly take the
 * recovery surface down.
 */
export const VIEW_ACTION = "view";
export const LIST_ACTION = "list";
export const SELECT_ACTION = "select";

/**
 * The actions a `bypassTenantAccessGate` table view may still serve while a
 * gate denies the tenant: reading its rows, and nothing else.
 *
 * `export` is deliberately out — it queues a job and delivers a file, which is
 * a side effect on a tenant the product has been shut off for, not a read of
 * the recovery surface.
 */
// @internal — read by the tests that check this list against the actions a
// real table view declares.
export const GATE_BYPASSABLE_ACTIONS = [
  VIEW_ACTION,
  LIST_ACTION,
  SELECT_ACTION,
];

function isGateBypassableAction(
  actionId: string,
  permissionId: string | undefined,
): boolean {
  return !!permissionId && GATE_BYPASSABLE_ACTIONS.includes(actionId);
}

// @internal
export async function authorizeAction(
  thisObj: unknown,
  actionId: string,
  user: User,
  tenantId: string,
): Promise<Set<string> | undefined> {
  const meta = GetMetadata(
    (thisObj as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );
  // Table-view data routes are tenant product surfaces: the tenant access
  // gate applies even when the action carries no permission id. Table views
  // flagged `bypassTenantAccessGate` opt out so they stay reachable on
  // recovery surfaces.
  const action = meta.componentBuilder?.getAction(actionId);
  const permissionId = action?.permissionId;
  // The opt-out only rides along with a stamped, read-only action. The flag
  // latches controller-wide, so anything else — an unstamped action on a
  // component no page mounted, or a write — would be served from every page
  // sharing the controller, to any member of a denied tenant. What the
  // opt-out exists for is reading a recovery surface, never changing the data
  // of a tenant the product has been shut off for.
  if (
    !meta.bypassTenantAccessGate ||
    !isGateBypassableAction(actionId, permissionId)
  ) {
    if (meta.bypassTenantAccessGate) {
      Logging.Trace(
        `[DMS] Action "${actionId}" of a bypassTenantAccessGate table view is not a permission-carrying read: the tenant access gate applies to it.`,
      );
    }
    await AssertTenantAccess(user._id, tenantId);
  }
  if (!action || !permissionId) {
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
  if (await HasPermission(permissions, permissionId)) {
    return permissions;
  }
  throwHttpAssert(false, 403, `Forbidden: missing permission ${permissionId}`);
}

export function withActionCheck<T extends DataControllerCallback>(
  actionId: string,
  baseRoute: T,
): DataControllerCallback {
  return {
    method: baseRoute.method,
    args: [...baseRoute.args, AuthUser()],
    func: async function (this: unknown, ...allArgs: unknown[]) {
      const user = allArgs.pop() as User;
      const ctx = allArgs[0] as RequestContext;
      await authorizeAction(this, actionId, user, getRequestTenantId(ctx));
      return (baseRoute.func as (...a: unknown[]) => unknown).apply(
        this,
        allArgs,
      );
    },
  };
}

export function withActionCheckOptions(
  actionId: string,
  baseRoute: DataControllerCallbackWithOptions,
): DataControllerCallbackWithOptions {
  return {
    endpoint: baseRoute.endpoint,
    options: baseRoute.options,
    callback: withActionCheck(actionId, baseRoute.callback),
  };
}
