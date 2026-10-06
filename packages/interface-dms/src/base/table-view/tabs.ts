// The filter tabs of a table view: how the options carry them, which ones a
// request is served, and the warning when their counters have no route.
//
// Split out of factory-helpers.ts.

import {
  type ControllerClass,
  ControllerMeta,
} from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { Logging } from "@antelopejs/interface-core/logging";
import type { DataControllerCallbackWithOptions } from "@antelopejs/interface-data-api";
import { GetPermissionId, PageMetadata } from "../../page";
import { holdsPermissionGate } from "../../permission-gate";
import { HasPermission } from "../../permissions";
import type {
  TableViewOptions,
  TableViewTab,
  TableViewTabSerialized,
} from "./options";

function dataApiLocation(countFrom: ControllerClass | string): string {
  return typeof countFrom === "string"
    ? countFrom
    : GetMetadata(countFrom, ControllerMeta).location;
}

/**
 * Tabs as the options carry them: a link tab's path target and its count
 * location are plain strings already; a page controller target is resolved
 * per request by {@link resolveTableViewTabs}, once pages are registered.
 *
 * @internal
 */
export function serializeTableViewTabs(
  tabs: TableViewTab[] | undefined,
): TableViewTabSerialized[] | undefined {
  return tabs?.map(
    ({
      to,
      countFrom,
      permission: _permission,
      permissionId: _permissionId,
      ...tab
    }) => {
      const serialized: TableViewTabSerialized = { ...tab };
      if (typeof to === "string") serialized.to = to;
      if (countFrom) serialized.countFrom = dataApiLocation(countFrom);
      return serialized;
    },
  );
}

const withLeadingSlash = (path: string): string =>
  path.startsWith("/") ? path : `/${path}`;

/**
 * The tabs served to one request: a tab is kept only for a caller its gate
 * admits — a link tab to a page, that page's own permission; any other tab,
 * its `permission` (relative to the table view) or `permissionId` — and a
 * page target is resolved to its path and full id. A page that never
 * registered drops its tab.
 *
 * @internal
 */
export async function resolveTableViewTabs(
  permissions: Set<string>,
  declaredTabs: TableViewTab[] | undefined,
  serializedTabs: TableViewTabSerialized[] | undefined,
  componentPermissionId: string,
): Promise<TableViewTabSerialized[] | undefined> {
  if (!declaredTabs || !serializedTabs) return serializedTabs;
  const kept: TableViewTabSerialized[] = [];
  for (const [index, tab] of serializedTabs.entries()) {
    const declared = declaredTabs[index];
    const target = declared?.to;
    if (target && typeof target !== "string") {
      const page = GetMetadata(target, PageMetadata).pageInfo;
      if (!page) continue;
      const permissionId = GetPermissionId(target);
      if (permissionId && !(await HasPermission(permissions, permissionId))) {
        continue;
      }
      kept.push({
        ...tab,
        to: withLeadingSlash(page.fullSlug),
        toPage: page.fullId,
      });
      continue;
    }
    if (
      await holdsPermissionGate(permissions, declared, componentPermissionId)
    ) {
      kept.push(tab);
    }
  }
  return kept;
}

/**
 * Whether a table view shows counters the `count/batch` route serves: filter
 * tabs, counted views or counted groups.
 *
 * @internal
 */
export function declaresCounters(
  options: Pick<TableViewOptions, "tabs" | "views" | "grouped">,
): boolean {
  return (
    (options.tabs?.length ?? 0) > 0 ||
    !!options.views?.items.some((view) => view.count) ||
    !!options.grouped?.count
  );
}

const COUNT_BATCH_PATH = "count/batch";
const COUNT_BATCH_METHOD = "post";
const EDGE_SLASHES = /^\/+|\/+$/g;

const controllersWarnedForTabCounts = new WeakSet<ControllerClass>();

// Matched on the mounted path and method rather than on the route object: a
// module mounts its own per-context copy of `TableViewRoutes.CountBatch`.
/** @internal */
export function servesRoute(
  endpoints: Record<string, DataControllerCallbackWithOptions>,
  path: string,
  method: string,
): boolean {
  return Object.entries(endpoints).some(
    ([key, entry]) =>
      (entry.endpoint ?? key).replace(EDGE_SLASHES, "") === path &&
      entry.callback.method.toLowerCase() === method,
  );
}

/**
 * Warn, once per controller, when a table view declares filter tabs, counted
 * views or counted groups but its controller mounts no `POST count/batch`
 * route: every counter request would fail. The fix belongs in the controller
 * (mount `countBatch: TableViewRoutes.CountBatch`), so this only reports it.
 *
 * @internal
 */
export function warnIfTabsLackCountBatch(
  controller: ControllerClass,
  location: string,
  hasCounters: boolean,
  endpoints: Record<string, DataControllerCallbackWithOptions>,
): void {
  if (!hasCounters || controllersWarnedForTabCounts.has(controller)) return;
  if (servesRoute(endpoints, COUNT_BATCH_PATH, COUNT_BATCH_METHOD)) return;
  controllersWarnedForTabCounts.add(controller);
  Logging.Warn(
    `[DMS] TableView on "${controller.name}" (${location}) declares filter tabs, counted views or counted groups but its controller mounts no POST ${location}/${COUNT_BATCH_PATH} route: their counters will fail. Mount \`countBatch: TableViewRoutes.CountBatch\` on the controller.`,
  );
}
