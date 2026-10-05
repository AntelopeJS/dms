// The views of a table view: named states a module declares (and users save)
// over the same rows, the URL keys that open them, and the link a backend
// builds to one of them.

import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { PageMetadata } from "../../page";
import { holdsPermissionGate } from "../../permission-gate";
import type {
  TableViewViewSerialized,
  TableViewViewsOptions,
  TableViewViewsSerialized,
} from "./options";

/** Query key opening a view, prefixed by the table's id on the page. */
export const TABLE_VIEW_VIEW_QUERY_KEY = "view";
/** Query key opening a tab, prefixed by the table's id on the page. */
export const TABLE_VIEW_TAB_QUERY_KEY = "tab";

/** What a link to a table opens. */
export interface TableViewLinkTarget {
  /** Id of the view to open. */
  view?: string;
  /** Id of the tab to open. */
  tab?: string;
}

const withLeadingSlash = (path: string): string =>
  path.startsWith("/") ? path : `/${path}`;

/**
 * The dashboard path of a page opening one of its table views on a view or a
 * tab (`/workspaces?content.view=past-due`), for a StatStrip item, a KPI card
 * or a notification. `tableId` is the key the table view is mounted under in
 * the page (`page.SetComponent("content", TableView(...))`).
 * @throws When `page` is no page controller.
 */
export function tableViewLink(
  page: ControllerClass,
  tableId: string,
  target: TableViewLinkTarget,
): string {
  const pageInfo = GetMetadata(page, PageMetadata).pageInfo;
  if (!pageInfo) {
    throw new Error(
      `tableViewLink: ${page.name} is no page controller, it has no URL`,
    );
  }
  const query = new URLSearchParams();
  if (target.view) {
    query.set(`${tableId}.${TABLE_VIEW_VIEW_QUERY_KEY}`, target.view);
  }
  if (target.tab) {
    query.set(`${tableId}.${TABLE_VIEW_TAB_QUERY_KEY}`, target.tab);
  }
  const search = query.toString();
  const path = withLeadingSlash(pageInfo.fullSlug);
  return search ? `${path}?${search}` : path;
}

/** The views as the options carry them: their permission stays server-side. */
export function serializeTableViewViews(
  views: TableViewViewsOptions | undefined,
): TableViewViewsSerialized | undefined {
  if (!views) return undefined;
  return {
    ...views,
    items: views.items.map(
      ({
        permission: _permission,
        permissionId: _permissionId,
        ...view
      }): TableViewViewSerialized => view,
    ),
  };
}

/**
 * The views served to one request: a view whose permission the caller lacks
 * is left out. A default view left out falls back to the table's own state.
 */
export async function resolveTableViewViews(
  permissions: Set<string>,
  declared: TableViewViewsOptions | undefined,
  serialized: TableViewViewsSerialized | undefined,
  componentPermissionId: string,
): Promise<TableViewViewsSerialized | undefined> {
  if (!declared || !serialized) return serialized;
  const items: TableViewViewSerialized[] = [];
  for (const [index, view] of serialized.items.entries()) {
    const gate = declared.items[index];
    if (await holdsPermissionGate(permissions, gate, componentPermissionId)) {
      items.push(view);
    }
  }
  const hasDefault = items.some((view) => view.id === serialized.defaultView);
  return {
    ...serialized,
    items,
    defaultView: hasDefault ? serialized.defaultView : undefined,
  };
}
