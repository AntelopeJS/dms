import type { PlaygroundFeature } from "./types";
import {
  feature,
  PAGES,
  V2_DESIGN,
  REQUEST_LOG_GAPS,
  COLUMN_HIDDEN,
  URL_TAB_FOLLOW,
  SOURCE_TOKENS,
  VISIBLE_QUERY_FILTERS,
  BY_STATUS_SLUG,
  SIDE_PANEL,
} from "./table-view-data";

export const FORMS_AND_CONTAINERS: PlaygroundFeature[] = [
  feature(
    "Forms in a side drawer",
    'formContainer: { type: "drawer" }',
    PAGES.drawer,
  ),
  feature(
    "Forms in a modal, sized",
    'formContainer: { type: "modal", size }',
    PAGES.modal,
  ),
  feature(
    "Forms as pages at generated URLs",
    'formContainer: { type: "page" }',
    PAGES.page,
  ),
  feature(
    "Form titles and descriptions",
    "formContainer.pages.*.displayName / description",
    PAGES.page,
  ),
  feature(
    "Form pages at URLs the module names",
    "formContainer.pages.*.urlSlug",
    PAGES.customUrls,
  ),
  feature("Form fields in titled sections", "@ColumnGroup", PAGES.formGroups),
  feature(
    "Quick action opening a table's add form",
    'QuickAction({ target: { type: "openForm", page } })',
    PAGES.drawer,
  ),
];

export const LAYOUT_AND_PAGING: PlaygroundFeature[] = [
  feature(
    "Compact row density",
    'TableView({ density: "compact" })',
    PAGES.density,
    V2_DESIGN,
  ),
  feature(
    "Own scroll area under a sticky header",
    "TableView({ maxHeight })",
    PAGES.density,
  ),
  feature(
    "Settings-page list layout",
    'TableView({ layout: "compact" })',
    PAGES.compact,
    V2_DESIGN,
  ),
  feature(
    "Search field placeholder",
    "TableView({ searchPlaceholder })",
    PAGES.compact,
    V2_DESIGN,
  ),
  feature(
    "Search shortcut key",
    'TableView({ searchShortcut: "/" })',
    PAGES.requestLog,
    REQUEST_LOG_GAPS,
  ),
  feature(
    "One-click quick filters",
    "TableView({ quickFilters: [{ field, label, icon, allLabel, mode }] })",
    PAGES.compact,
    V2_DESIGN,
  ),
  feature(
    "Custom default page size",
    "TableView({ pageSize: 15 })",
    PAGES.compact,
  ),
  feature(
    '"Load more" pagination',
    'TableView({ pagination: "loadMore" })',
    PAGES.sources,
    V2_DESIGN,
  ),
  feature(
    "Infinite scroll",
    'TableView({ pagination: "infinite" })',
    PAGES.compact,
    V2_DESIGN,
  ),
  feature(
    "Columns hidden on one page only",
    'TableView({ columns: { hidden: ["url"] } })',
    PAGES.compact,
    COLUMN_HIDDEN,
  ),
  feature(
    "Footer count label and hint",
    "TableView({ footer: { countLabel, hint } })",
    PAGES.compact,
    V2_DESIGN,
  ),
  feature(
    "Footer figures computed by the server",
    'footer.summary: [{ label, field, op: "sum" | "count", where }]',
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Footer figure number format",
    'footer.summary[].format: { style: "currency", notation: "compact" }',
    PAGES.compact,
    V2_DESIGN,
  ),
  feature(
    "Footer legend of a select column",
    'footer.legend: "status"',
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Rows pinned first whatever the sort",
    'TableView({ pinnedRows: { field: "priority", equals: "high" } })',
    PAGES.compact,
    REQUEST_LOG_GAPS,
  ),
  feature(
    "Default sort, restored when the user clears theirs",
    "TableView({ defaultSort })",
    PAGES.compact,
    REQUEST_LOG_GAPS,
  ),
  feature(
    "Grouped display by value or day",
    "TableView({ grouped: { groupByField, by, collapsible, count } })",
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Grouped display by week",
    'grouped: { by: "week" }',
    PAGES.compact,
    V2_DESIGN,
  ),
  feature(
    "Expandable rows listing fields",
    "TableView({ expandable: { fields, fieldsLabel, defaultExpanded } })",
    PAGES.expandable,
    V2_DESIGN,
  ),
  feature(
    "Expandable rows drawn by a component, loaded on open",
    "expandable: { component, single, lazyLoad }",
    PAGES.expandable,
    V2_DESIGN,
  ),
];

export const FILTERS_TABS_VIEWS: PlaygroundFeature[] = [
  feature(
    "Filter tabs with counters",
    "TableView({ tabs: [{ id, label, icon, filter }] })",
    PAGES.tabs,
  ),
  feature('Own "all" tab', 'tabs: [{ id: "all", label }]', PAGES.tabs),
  feature(
    "Tab linking to another page, counted",
    "tabs: [{ to: PageClass, countFrom: dataController }]",
    PAGES.tabs,
    V2_DESIGN,
  ),
  feature(
    "Tab counter as a sidebar badge",
    'tabs: [{ navBadge: true | { tone: "warning" } }]',
    PAGES.tabs,
    V2_DESIGN,
  ),
  feature(
    "Tabs gated by a permission",
    "tabs: [{ permission, permissionId }]",
    PAGES.tabs,
    V2_DESIGN,
  ),
  feature(
    "Open tab kept in the URL and followed",
    "?tab=<id> (TABLE_VIEW_TAB_QUERY_KEY)",
    `${PAGES.tabs}?tab=high_priority`,
    URL_TAB_FOLLOW,
  ),
  feature(
    "Link to a table's view or tab from the backend",
    "tableViewLink(Page, tableId, { view, tab })",
    PAGES.tabs,
    V2_DESIGN,
  ),
  feature(
    "Default filter chips, with or without a value",
    "TableView({ defaultFilters })",
    PAGES.tabs,
  ),
  feature(
    "Views as a strip, counted, with server tokens",
    'views: { layout: "strip", items: [{ filters, count, tone }] } + {{user.id}} / {{now-7d}}',
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Views in a menu",
    'views: { layout: "menu" }',
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Views as tabs next to filter tabs",
    'views: { layout: "tabs" }',
    PAGES.tabs,
    V2_DESIGN,
  ),
  feature(
    "View opening a display, density and hidden columns",
    "views.items[]: { display, density, columns.hidden }",
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "View with a search, column order and dot",
    "views.items[]: { search, sort, columns: { visible, order }, dot }",
    `${PAGES.tabs}?view=by-name`,
    V2_DESIGN,
  ),
  feature(
    "View gated by a permission",
    "views.items[]: { permission }",
    PAGES.tabs,
    V2_DESIGN,
  ),
  feature(
    "Users' own saved views and a default view",
    "views: { userViews: true, defaultView }",
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "View opened from the URL",
    "?<tableId>.view=<id>",
    `${PAGES.views}?runs.view=failing`,
    V2_DESIGN,
  ),
  feature(
    "Hidden filter from a URL query parameter",
    "TableView({ queryParamFilters: { status: { field } } })",
    `${PAGES.queryFilters}?status=pending`,
    SOURCE_TOKENS,
  ),
  feature(
    "URL filter as a removable chip",
    "queryParamFilters: { email: { field, visible: true, label, mode } }",
    `${PAGES.queryFilters}?minPrice=500`,
    VISIBLE_QUERY_FILTERS,
  ),
  {
    ...feature(
      "Filter from a route parameter of the page",
      "TableView({ routeParamFilters: { status: { field } } })",
      PAGES.byStatus,
    ),
    slug: BY_STATUS_SLUG,
  },
];

export const EMPTY_STATES_AND_REALTIME: PlaygroundFeature[] = [
  feature(
    "Empty state when filters match nothing",
    "emptyStates.filtered: { title, description, icon, actions }",
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Empty state drawn by a component",
    "emptyStates.*.component + useTableViewEmptyState()",
    `${PAGES.queryFilters}?email=nobody@example.com`,
    V2_DESIGN,
  ),
  feature(
    "Empty state of a table with no row yet",
    "emptyStates.firstRun",
    PAGES.relationMember,
    V2_DESIGN,
  ),
  feature(
    "Empty state of a failed list",
    "emptyStates.error",
    `${PAGES.sources}?route=GET%20%2Fapi%2Fbroken`,
    V2_DESIGN,
  ),
  feature(
    "Realtime turned off for a table",
    "TableView({ realtime: false })",
    PAGES.queryFilters,
  ),
  feature(
    "Rows read again on a module's realtime topic",
    "TableView({ realtimeTopic }) + PublishMessage",
    PAGES.views,
    SOURCE_TOKENS,
  ),
  feature(
    "Listener of every table write",
    "registerRealtimeMutationListener",
    PAGES.views,
  ),
  feature(
    "Rows held while a live page is paused",
    "TableView({ liveHold }) on a page declared with live",
    PAGES.requestLog,
    SIDE_PANEL,
  ),
  feature(
    "Table held while a row is open, a search or a sort is on",
    "liveHold: { whileRowOpen, whileSearching, whileSorted, missedLabel }",
    PAGES.requestLog,
    REQUEST_LOG_GAPS,
  ),
];
