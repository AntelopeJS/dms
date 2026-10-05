// The navigation badges a table view publishes: the counter of a tab declared
// with `navBadge`, counted on the server when the menu loads.

import {
  type ControllerClass,
  GetControllerInstance,
  type RequestContext,
} from "@antelopejs/interface-api";
import { Logging } from "@antelopejs/interface-core/logging";
import {
  type DataControllerCallback,
  GetDataControllerMeta,
} from "@antelopejs/interface-data-api";
import { Parameters } from "@antelopejs/interface-data-api/components";
import type { ComponentBuilder, NavBadgeSource } from "../../component";
import type { User } from "../../auth/db";
import { getRequestTenantId } from "../../request-tenant";
import { authorizeAction, LIST_ACTION } from "./auth";
import { countWithSearch } from "./data-functions";
import type { TableViewTab, TableViewTabFilter } from "./options";

const FILTER_QUERY_PREFIX = "filter_";

/** The list query a tab's hidden filter reads as (`filter_<key>=<mode>:<value>`). */
function tabFilterQuery(
  filter: TableViewTabFilter | undefined,
): Record<string, string> {
  if (!filter) return {};
  return {
    [`${FILTER_QUERY_PREFIX}${filter.accessorKey}`]: `${filter.mode}:${filter.value ?? ""}`,
  };
}

function withQuery(
  ctx: RequestContext,
  query: Record<string, string>,
): RequestContext {
  const url = new URL(ctx.url);
  url.search = "";
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return { ...ctx, url };
}

/**
 * The rows of `controller` the caller lists through `filter`, read with the
 * caller's own `list` permission, as the table's tab counter is: it throws
 * for a caller without it.
 */
async function countRows(
  controller: ControllerClass,
  ctx: RequestContext,
  user: User,
  filter: TableViewTabFilter | undefined,
): Promise<number> {
  const instance = await GetControllerInstance(controller, ctx);
  const permissions = await authorizeAction(
    instance,
    LIST_ACTION,
    user,
    getRequestTenantId(ctx),
  );
  const queryContext = withQuery(ctx, tabFilterQuery(filter));
  const filters = Parameters.ExtractFilters(
    queryContext,
    GetDataControllerMeta(instance),
  );
  const { total } = await countWithSearch(
    instance as DataControllerCallback,
    queryContext,
    { filters },
    user,
    permissions,
  );
  return total;
}

/**
 * The badge a `navBadge` tab publishes: a filter tab counts its table for its
 * own page, a link tab counts its `countFrom` controller for the page it links
 * to. A link tab given as a path, or counting from a location, cannot say
 * which page or controller it means: it is warned about and publishes nothing.
 */
function navBadgeSourceOf(
  tab: TableViewTab,
  controller: ControllerClass,
): NavBadgeSource | undefined {
  if (!tab.to) {
    return {
      count: (ctx, user) => countRows(controller, ctx, user, tab.filter),
    };
  }
  const { to, countFrom } = tab;
  if (typeof to === "string" || !countFrom || typeof countFrom === "string") {
    Logging.Warn(
      `[DMS] TableView on "${controller.name}": tab "${tab.id}" sets navBadge but links to a path or counts from a location; a navigation badge needs a page controller \`to\` and a data controller \`countFrom\`. It publishes nothing.`,
    );
    return undefined;
  }
  return {
    page: to,
    count: (ctx, user) => countRows(countFrom, ctx, user, undefined),
  };
}

/** Declares on `builder` the navigation badges of the tabs that publish one. */
export function declareTabNavBadges<T>(
  builder: ComponentBuilder<T>,
  tabs: TableViewTab[] | undefined,
  controller: ControllerClass,
): void {
  for (const tab of tabs ?? []) {
    if (!tab.navBadge) continue;
    const source = navBadgeSourceOf(tab, controller);
    if (source) builder.navBadge(source);
  }
}
