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
import {
  GetEffectiveUserPermissions,
  HasAnyPermission,
  HasPermission,
} from "../../permissions";
import { getRequestTenantId } from "../../request-tenant";
import { AssertTenantAccess } from "../../tenant-access";
import { AuthUser } from "../../auth";
import type { User } from "../../auth/db";
import type { ComponentBuilder } from "../../component";
import { TableViewMeta } from "./meta";
import {
  TABLE_VIEW_QUERY_KEY,
  type TableViewOptionsSerialized,
} from "./options";

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
  permissionIds: string[],
): boolean {
  return permissionIds.length > 0 && GATE_BYPASSABLE_ACTIONS.includes(actionId);
}

type TableViewBuilder = ComponentBuilder<TableViewOptionsSerialized>;

/** The table view a request names (`?tableView=`), if any. */
// @internal
export function getRequestTableKey(
  ctx: RequestContext | undefined,
): string | undefined {
  return ctx?.url?.searchParams?.get(TABLE_VIEW_QUERY_KEY) || undefined;
}

/**
 * The mounted table view a request names for `actionId`. A key that names
 * none (unknown, or a table view without the action) is refused: falling back
 * to the other table views would let a request pick whose permission and row
 * rules apply to it.
 */
// @internal
export function namedTableView(
  meta: TableViewMeta,
  tableKey: string,
  actionId: string,
): TableViewBuilder {
  const builder = meta.tableViewFor(tableKey, actionId);
  throwHttpAssert(
    builder,
    403,
    `Forbidden: table view ${tableKey} has no ${actionId} action`,
  );
  return builder;
}

/**
 * The permission ids guarding `actionId` for a request: the named table
 * view's alone, else the one of every table view mounting the controller.
 */
// @internal
export function actionPermissionIds(
  meta: TableViewMeta,
  actionId: string,
  tableKey: string | undefined,
): string[] {
  if (tableKey === undefined) return meta.actionPermissionIds(actionId);
  const named = namedTableView(meta, tableKey, actionId);
  return [named.getAction(actionId)!.permissionId!];
}

// @internal
export async function authorizeAction(
  thisObj: unknown,
  actionId: string,
  user: User,
  tenantId: string,
  tableKey?: string,
): Promise<Set<string> | undefined> {
  const meta = GetMetadata(
    (thisObj as { constructor: ControllerClass }).constructor,
    TableViewMeta,
  );
  // Table-view data routes are tenant product surfaces: the tenant access
  // gate applies even when the action carries no permission id. Table views
  // flagged `bypassTenantAccessGate` opt out so they stay reachable on
  // recovery surfaces.
  //
  // Several table views may share the controller (one per page mounting it):
  // the action is guarded by the permission of each of them, never by the one
  // built last alone, which refused every other table's callers.
  //
  // A request naming its table view is held to that table's permission alone:
  // its row rules are the ones applied to it, so a permission on another table
  // must not reach them.
  const permissionIds = actionPermissionIds(meta, actionId, tableKey);
  // The opt-out only rides along with a stamped, read-only action. The flag
  // latches controller-wide, so anything else — an unstamped action on a
  // component no page mounted, or a write — would be served from every page
  // sharing the controller, to any member of a denied tenant. What the
  // opt-out exists for is reading a recovery surface, never changing the data
  // of a tenant the product has been shut off for.
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

const actingTableViewsByRequest = new WeakMap<
  RequestContext,
  { actionId: string; tableViews: TableViewBuilder[] }
>();

/**
 * The table views a request acts through for `actionId`, whose row rules
 * apply to it: the one it names (`?tableView=`); else every mounted table
 * view whose action the caller holds, each granting exactly what its own page
 * grants; else, when no page mounted the controller, every table view built
 * over it.
 */
// @internal
export async function resolveActingTableViews(
  meta: TableViewMeta,
  actionId: string,
  tableKey: string | undefined,
  permissions: Set<string> | undefined,
): Promise<TableViewBuilder[]> {
  if (tableKey !== undefined) {
    return [namedTableView(meta, tableKey, actionId)];
  }
  const mounted = meta.componentBuilders.filter(
    (builder) => !!builder.getAction(actionId)?.permissionId,
  );
  if (mounted.length === 0) return [...meta.componentBuilders];
  if (!permissions) return mounted;
  const held: TableViewBuilder[] = [];
  for (const builder of mounted) {
    const permissionId = builder.getAction(actionId)!.permissionId!;
    if (await HasPermission(permissions, permissionId)) held.push(builder);
  }
  return held;
}

/**
 * The table views `withActionCheck` resolved for this request and action, or
 * undefined when the route was reached without it.
 */
// @internal
export function actingTableViewsOf(
  ctx: RequestContext,
  actionId: string,
): TableViewBuilder[] | undefined {
  const entry = actingTableViewsByRequest.get(ctx);
  return entry?.actionId === actionId ? entry.tableViews : undefined;
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
      const tableKey = getRequestTableKey(ctx);
      const permissions = await authorizeAction(
        this,
        actionId,
        user,
        getRequestTenantId(ctx),
        tableKey,
      );
      if (ctx && typeof ctx === "object") {
        const meta = GetMetadata(
          (this as { constructor: ControllerClass }).constructor,
          TableViewMeta,
        );
        actingTableViewsByRequest.set(ctx, {
          actionId,
          tableViews: await resolveActingTableViews(
            meta,
            actionId,
            tableKey,
            permissions,
          ),
        });
      }
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
