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
import { HasPermission } from "../../permissions";
import type { TableViewTab, TableViewTabSerialized } from "./options";

function dataApiLocation(countFrom: ControllerClass | string): string {
  return typeof countFrom === "string"
    ? countFrom
    : GetMetadata(countFrom, ControllerMeta).location;
}

/** A tab filters the rows or opens another page, never both. */
export function assertTabTargets(
  controllerName: string,
  tabs: TableViewTab[] | undefined,
): void {
  for (const tab of tabs ?? []) {
    if (tab.filter && tab.to) {
      throw new Error(
        `TableView tab "${tab.id}" on ${controllerName} gives both a filter and a link (to): a tab filters the rows or opens another page, not both`,
      );
    }
  }
}

/**
 * Tabs as the options carry them: a link tab's path target and its count
 * location are plain strings already; a page controller target is resolved
 * per request by {@link resolveTableViewTabs}, once pages are registered.
 */
export function serializeTableViewTabs(
  tabs: TableViewTab[] | undefined,
): TableViewTabSerialized[] | undefined {
  return tabs?.map(({ to, countFrom, permission: _permission, ...tab }) => {
    const serialized: TableViewTabSerialized = { ...tab };
    if (typeof to === "string") serialized.to = to;
    if (countFrom) serialized.countFrom = dataApiLocation(countFrom);
    return serialized;
  });
}

const withLeadingSlash = (path: string): string =>
  path.startsWith("/") ? path : `/${path}`;

/**
 * The tabs served to one request: a link tab is kept only for a caller its
 * target admits — the page's own permission, or the declared `permission` —
 * and a page target is resolved to its path and full id. A page that never
 * registered drops its tab.
 */
export async function resolveTableViewTabs(
  permissions: Set<string>,
  declaredTabs: TableViewTab[] | undefined,
  serializedTabs: TableViewTabSerialized[] | undefined,
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
      declared?.permission &&
      !(await HasPermission(permissions, declared.permission))
    ) {
      continue;
    }
    kept.push(tab);
  }
  return kept;
}

const COUNT_BATCH_PATH = "count/batch";
const COUNT_BATCH_METHOD = "post";
const EDGE_SLASHES = /^\/+|\/+$/g;

const controllersWarnedForTabCounts = new WeakSet<ControllerClass>();

// Matched on the mounted path and method rather than on the route object: a
// module mounts its own per-context copy of `TableViewRoutes.CountBatch`.
function servesCountBatch(
  endpoints: Record<string, DataControllerCallbackWithOptions>,
): boolean {
  return Object.entries(endpoints).some(
    ([key, entry]) =>
      (entry.endpoint ?? key).replace(EDGE_SLASHES, "") === COUNT_BATCH_PATH &&
      entry.callback.method.toLowerCase() === COUNT_BATCH_METHOD,
  );
}

/**
 * Warn, once per controller, when a table view declares filter tabs but its
 * controller mounts no `POST count/batch` route: every tab counter request
 * would fail. The fix belongs in the controller (mount
 * `countBatch: TableViewRoutes.CountBatch`), so this only reports it.
 */
export function warnIfTabsLackCountBatch(
  controller: ControllerClass,
  location: string,
  hasTabs: boolean,
  endpoints: Record<string, DataControllerCallbackWithOptions>,
): void {
  if (!hasTabs || controllersWarnedForTabCounts.has(controller)) return;
  if (servesCountBatch(endpoints)) return;
  controllersWarnedForTabCounts.add(controller);
  Logging.Warn(
    `[DMS] TableView on "${controller.name}" (${location}) declares filter tabs but its controller mounts no POST ${location}/${COUNT_BATCH_PATH} route: tab counters will fail. Mount \`countBatch: TableViewRoutes.CountBatch\` on the controller.`,
  );
}
