// The views of a table view: named states a module declares (and users save)
// over the same rows, the URL keys that open them, and the link a backend
// builds to one of them.

import type { ControllerClass } from "@antelopejs/interface-api";
import { GetMetadata } from "@antelopejs/interface-core";
import { PageMetadata } from "../../page";

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
 * tab (`/workspaces?content.view=past-due`), for a StatGroup item, a KPI card
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
