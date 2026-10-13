// A table view over rows a module's own route lists, without a data
// controller: `TableView.fromSource(...)`. Read-only — its rows open custom
// drawers or call custom routes, never the built-in forms.

import { ComponentBuilder } from "../../component";
import { ReadonlyBehaviorType } from "../types";
import { serializeType } from "../data-types";
import { LIST_ACTION } from "./internal/auth";
import { serializeColumnDisplay } from "./internal/column-display";
import {
  serializeCustomButtons,
  serializeExpandable,
  serializeRowActions,
  serializeTableViewDisplays,
} from "./internal/factory-helpers";
import type { ColumnOptions } from "./meta";
import { TABLE_VIEW_COMPONENT_NAME } from "./internal/options";
import type {
  TableViewFooterOptions,
  TableViewOptions,
  TableViewOptionsSerialized,
  TableViewRowActionOptions,
} from "./options";
import {
  resolveCustomButtons,
  resolveCustomRowActions,
} from "./internal/request-filter";
import { resolveTableViewTabs, serializeTableViewTabs } from "./internal/tabs";
import { registerTableViewCustomTopics } from "./internal/realtime";
import type { PageMetadata } from "../../page";
import { serializeEmptyStates } from "./internal/footer";
import {
  assertTabTargets,
  validateDefaultDisplay,
  validateDisplayIds,
  validatePageSize,
} from "./internal/validation";

/** A column of a source table: a `@Column`'s options, keyed by row field. */
export interface TableViewSourceColumn extends Pick<
  ColumnOptions,
  | "name"
  | "description"
  | "type"
  | "order"
  | "isVisible"
  | "filterable"
  | "cellWrap"
  | "size"
  | "display"
> {
  /** The rows can be sorted on it (by the route, or by the browser). */
  sortable?: boolean;
}

/**
 * What the route does with the list query it is sent. What it leaves to the
 * browser, the browser does over the rows the route answered.
 */
export interface TableViewSourceCapabilities {
  /** The route reads `search` and narrows its rows. */
  search?: boolean;
  /** The route reads `sortKey` and `sortDirection`. */
  sort?: boolean;
  /**
   * The route reads `offset` and `limit` and answers one page. The browser
   * can then neither search nor sort rows it never received: the table
   * searches and sorts only if the route does (`search`, `sort`).
   */
  paginate?: boolean;
  /**
   * The route reads `filter_<column>=<mode>:<value>`: columns may then be
   * `filterable`, and tabs and quick filters filter on them.
   */
  filter?: boolean;
}

/**
 * The source table's options, the ones a read-only list can honour, plus
 * `periodScope`: the rows of a report follow a `PeriodSelector` like a chart.
 */
export interface TableViewSourceOptions extends Pick<
  TableViewOptions,
  | "caption"
  | "layout"
  | "density"
  | "maxHeight"
  | "rowClick"
  | "pageSize"
  | "pagination"
  | "emptyStates"
  | "searchPlaceholder"
  | "searchShortcut"
  | "labelKey"
  | "customButtons"
  | "displays"
  | "tableDisplay"
  | "defaultDisplay"
  | "card"
  | "expandable"
  | "tabs"
  | "quickFilters"
  | "defaultSort"
  | "pinnedRows"
  | "realtimeTopic"
  | "liveHold"
  | "queryParamFilters"
> {
  /** The columns, keyed by row field, in their declared `order`. */
  columns: Record<string, TableViewSourceColumn>;
  /**
   * Route answering `{ results, total }` for the list query (`offset`,
   * `limit`, `sortKey`, `sortDirection`, `search`, `filter_<column>`).
   *
   * It may name the page it is shown on: `{{params.X}}` is filled with the
   * route parameter `X` of the page URL (`{{params.id}}` on a detail page
   * whose slug is `:id`; `{{params.id:1}}` for the first of a repeated name),
   * `{{query.X}}` with its query parameter `X`, both percent-encoded. The
   * table and its tab counters list again when they change, and request
   * nothing while a token has no value: the table shows its empty state
   * instead.
   */
  fetchUrl: string;
  /**
   * Route answering ONE row, by id: a template where `{id}` is the row's id
   * (percent-encoded), with the same `{{params.X}}` / `{{query.X}}` tokens as
   * `fetchUrl`, e.g. `"/api/requests/{id}"`. The route answers the row
   * itself, or an error (a 404) when it is gone.
   *
   * A deep link (`?record=<id>`) to a row the table does not list — an older
   * request beyond the first page — opens through it; the side panel or
   * drawer then shows the row without its position among the rows shown.
   * Without it, a deep link opens only a listed row.
   *
   * It is sent no query: one row by id depends on no period, filter, search
   * or page, so a `PeriodSelector` scoping the table does not reach it.
   * @example "/api/requests/{id}"
   */
  fetchRowUrl?: string;
  /** The key of the row id, `_id` by default. */
  rowIdKey?: string;
  /**
   * Id of the `PeriodSelector` the rows follow, as a chart's `periodScope`:
   * `fetchUrl` is requested with `from`, `to`, `preset` and `comparison`
   * (and `compareFrom` / `compareTo` while a comparison is on), and the table
   * and its tab counters list again when the period changes. Nothing is
   * requested until that selector is on the page: the table keeps its
   * skeleton meanwhile.
   */
  periodScope?: string;
  /** What the route handles itself; the browser does the rest. */
  capabilities?: TableViewSourceCapabilities;
  /** Custom actions only: there are no built-in forms over a source. */
  rowActions?: Pick<
    TableViewRowActionOptions,
    "custom" | "hasSelection" | "menuLabel"
  >;
  /** The footer's texts and legend; summaries need a data controller. */
  footer?: Pick<TableViewFooterOptions, "countLabel" | "hint" | "legend">;
}

/** Where a source table reads its rows, as it reaches the client. */
export interface TableViewSourceSerialized {
  fetchUrl: string;
  /** Route answering one row, `{id}` its id (see `TableViewSourceOptions`). */
  fetchRowUrl?: string;
  capabilities: TableViewSourceCapabilities;
  /** Id of the `PeriodSelector` whose period is sent to `fetchUrl`. */
  periodScope?: string;
}

// The built-in row actions a source table never offers.
const NO_BUILT_IN_ACTIONS = {
  add: false,
  edit: false,
  delete: false,
  duplicate: false,
  details: false,
  copyLink: false,
} as const;

const byOrder = (
  [, a]: [string, TableViewSourceColumn],
  [, b]: [string, TableViewSourceColumn],
) => (a.order ?? 0) - (b.order ?? 0);

/**
 * Whether the table offers a search or a sort: the route handles it, or it
 * answers every row and the browser does.
 */
function browserCan(
  capabilities: TableViewSourceCapabilities,
  capability: "search" | "sort",
): boolean {
  return !!capabilities[capability] || !capabilities.paginate;
}

/** The columns as the column metadata of a table view carries them. */
function serializeSourceColumns(
  columns: Record<string, TableViewSourceColumn>,
  capabilities: TableViewSourceCapabilities,
) {
  return Object.entries(columns)
    .sort(byOrder)
    .map(([key, column]) => ({
      id: key,
      header: column.name ?? key,
      isVisible: column.isVisible,
      type: serializeType(column.type),
      accessorKey: key,
      listable: true,
      enableSorting: !!column.sortable && browserCan(capabilities, "sort"),
      enableColumnFilter: !!column.filterable && !!capabilities.filter,
      cellWrap: column.cellWrap,
      size: column.size,
      display: serializeColumnDisplay(column.display),
      readonlyBehavior: ReadonlyBehaviorType.default,
    }));
}

/** Where `fetchRowUrl` takes the row's id. */
const ROW_ID_TOKEN = "{id}";

/** How registration errors name a source table. */
const sourceName = (options: TableViewSourceOptions): string =>
  `TableView.fromSource(${options.fetchUrl})`;

/**
 * Tabs, quick filters and `queryParamFilters` send column filters
 * (`filter_<field>`), which only a route reading them can apply.
 */
function assertSourceFilters(
  where: string,
  options: TableViewSourceOptions,
): void {
  const filtering =
    (options.tabs?.some((tab) => tab.filter) ?? false) ||
    (options.quickFilters?.length ?? 0) > 0;
  if (filtering && !options.capabilities?.filter) {
    throw new Error(
      `${where} filters with tabs or quick filters, which needs capabilities.filter: the route applies the filters`,
    );
  }
  const hasQueryParamFilters =
    Object.keys(options.queryParamFilters ?? {}).length > 0;
  if (hasQueryParamFilters && !options.capabilities?.filter) {
    throw new Error(
      `${where} sets queryParamFilters, which needs capabilities.filter: the route applies the filters`,
    );
  }
}

/**
 * The checks `TableView()` runs that apply to a source — the page size,
 * the display ids, a tab filtering or linking — and its own: tabs, quick
 * filters and `queryParamFilters` send column filters, which only a route
 * reading them can apply,
 * and every key an option names (card fields included) must be a column.
 */
function assertSourceOptions(options: TableViewSourceOptions): void {
  const where = sourceName(options);
  validatePageSize(where, options.pageSize);
  validateDisplayIds(where, options.displays);
  validateDefaultDisplay(where, options);
  assertTabTargets(where, options.tabs);
  if (options.fetchRowUrl && !options.fetchRowUrl.includes(ROW_ID_TOKEN)) {
    throw new Error(
      `${where} sets fetchRowUrl without ${ROW_ID_TOKEN}: the route needs the row's id`,
    );
  }
  assertSourceFilters(where, options);
  const keys = [
    ...(options.tabs ?? []).flatMap((tab) =>
      tab.filter ? [tab.filter.accessorKey] : [],
    ),
    ...(options.quickFilters ?? []).map((filter) => filter.field),
    ...(options.labelKey ? [options.labelKey] : []),
    ...(options.card?.fields ?? []),
  ];
  for (const key of keys) {
    if (!options.columns[key]) {
      throw new Error(`${where} references unknown column "${key}"`);
    }
  }
}

/**
 * A read-only table view over the rows a module's own route lists, with no
 * data controller behind it: an API's logs, a database's query result, a
 * marketing report. The route answers `{ results, total }` for the list
 * query; what it does not handle itself (`capabilities`) — search, sort,
 * pages — the browser does over the rows it answered. Rows open custom
 * actions (a drawer, a route), never the built-in forms; there is no
 * export nor footer summary, and no realtime beyond its `realtimeTopic`.
 * A `periodScope` sends the period of a `PeriodSelector` with each request.
 */
export function tableViewFromSource(
  options: TableViewSourceOptions,
): ComponentBuilder<TableViewOptionsSerialized> {
  assertSourceOptions(options);
  const capabilities = options.capabilities ?? {};
  const rowActions = serializeRowActions({
    ...options.rowActions,
    ...NO_BUILT_IN_ACTIONS,
  });
  const declaredCustomButtons = options.customButtons;
  const declaredCustomRowActions = options.rowActions?.custom;
  const declaredTabs = options.tabs;
  const builder = new ComponentBuilder<TableViewOptionsSerialized>(
    TABLE_VIEW_COMPONENT_NAME,
  );
  builder.action(LIST_ACTION, {
    title: "$dms.table.action_list",
    icon: "i-ph-list",
  });
  for (const { id, permission, permissionId } of declaredCustomButtons ?? []) {
    if (id) builder.button(id, { permission, permissionId });
  }
  // The column metadata a data controller would give its table views.
  const config = {
    location: options.fetchUrl,
    columns: serializeSourceColumns(options.columns, capabilities),
  };
  if (options.expandable?.lazyLoad) {
    throw new Error(
      `TableView expandable on ${sourceName(options)} sets lazyLoad: a source has no get route to load a row from`,
    );
  }
  const source: TableViewSourceSerialized = {
    fetchUrl: options.fetchUrl,
    capabilities,
  };
  if (options.fetchRowUrl) source.fetchRowUrl = options.fetchRowUrl;
  if (options.periodScope) source.periodScope = options.periodScope;
  const expandable = serializeExpandable(
    sourceName(options),
    { columns: options.columns },
    options.expandable,
  );
  return builder
    .options({
      ...config,
      source,
      rowActions,
      rowIdKey: options.rowIdKey,
      labelKey: options.labelKey,
      caption: options.caption,
      layout: options.layout,
      density: options.density,
      maxHeight: options.maxHeight,
      rowClick: options.rowClick,
      pageSize: options.pageSize,
      pagination: options.pagination,
      footer: options.footer,
      expandable,
      emptyStates: serializeEmptyStates(options.emptyStates),
      searchable: browserCan(capabilities, "search"),
      searchPlaceholder: options.searchPlaceholder,
      searchShortcut: options.searchShortcut,
      quickFilters: options.quickFilters,
      queryParamFilters: options.queryParamFilters,
      tabs: serializeTableViewTabs(options.tabs),
      displays: serializeTableViewDisplays(options),
      defaultDisplay: options.defaultDisplay,
      tableDisplay: options.tableDisplay,
      defaultSort: options.defaultSort,
      pinnedRows: options.pinnedRows,
      customButtons: serializeCustomButtons(declaredCustomButtons),
      enableTableExport: false,
      realtime: false,
      realtimeTopic: options.realtimeTopic,
      liveHold: options.liveHold,
      formComponents: {},
    })
    .meta({ name: options.caption || "TableView", icon: "i-ph-table" })
    .onCreated((parentPage: PageMetadata) => {
      const parentInfo = parentPage.pageInfo;
      if (!parentInfo) return;
      registerTableViewCustomTopics(parentInfo.fullId, options.realtimeTopic);
    })
    .onFilter(async (permissions, served, permissionId, context) => ({
      ...served,
      rowActions: {
        ...served.rowActions,
        custom: await resolveCustomRowActions(
          permissions,
          declaredCustomRowActions,
          served.rowActions?.custom,
          permissionId,
        ),
      },
      customButtons: await resolveCustomButtons(
        permissions,
        declaredCustomButtons,
        served.customButtons,
        permissionId,
        context,
      ),
      tabs: await resolveTableViewTabs(
        permissions,
        declaredTabs,
        served.tabs,
        permissionId,
      ),
    }));
}
