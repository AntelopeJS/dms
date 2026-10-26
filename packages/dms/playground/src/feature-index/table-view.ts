import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.tableView;
const ROOT = "/table-view";

const V2_DESIGN = "0.6.0";
const SUBLINES = "0.6.2";
const SOURCE_TOKENS = "0.7.2";
const CARD_REORDER = "0.7.5";
const COLUMN_HIDDEN = "0.7.6";
const SIDE_PANEL = "0.7.8";
const CARD_ACTIONS = "0.7.9";
const REQUEST_LOG_GAPS = "0.7.10";
const PAGE_TOKENS = "0.7.14";
const VISIBLE_QUERY_FILTERS = "0.7.15";
const URL_TAB_FOLLOW = "0.7.16";
const DOWNLOAD_TARGET = "0.7.17";
const LATEST = "0.7.21";

const PAGES = {
  drawer: `${ROOT}/table-view-drawer`,
  modal: `${ROOT}/table-view-modal`,
  page: `${ROOT}/table-view-page`,
  customUrls: `${ROOT}/table-view-page-custom-urls`,
  density: `${ROOT}/table-view-density`,
  compact: `${ROOT}/table-view-compact-list`,
  expandable: `${ROOT}/table-view-expandable-rows`,
  cells: `${ROOT}/table-view-cell-displays`,
  views: `${ROOT}/table-view-views`,
  queryFilters: `${ROOT}/table-view-query-filters`,
  sources: `${ROOT}/table-view-sources`,
  requestLog: `${ROOT}/table-view-request-log`,
  tabs: `${ROOT}/table-view-tabs`,
  byStatus: `${ROOT}/table-view-tasks-by-status/pending`,
  formGroups: `${ROOT}/table-view-grouped`,
  actions: `${ROOT}/table-view-custom-row-actions`,
  rules: `${ROOT}/table-view-conditional-delete`,
  archive: `${ROOT}/table-view-archive`,
  kanban: `${ROOT}/table-view-kanban`,
  kanbanCards: `${ROOT}/table-view-kanban-custom-card`,
  reorder: `${ROOT}/table-view-reorder`,
  inlineEdit: `${ROOT}/table-view-inline-edit`,
  moduleDisplay: `${ROOT}/table-view-cards-display`,
  relationKey: `${ROOT}/table-view-relation-key`,
  relationMember: `${ROOT}/table-view-relation-dms-member`,
  cascaderCategories: `${ROOT}/table-view-cascader-categories`,
  cascaderProducts: `${ROOT}/table-view-cascader-products`,
  users: `${ROOT}/table-view-users`,
  gateBypass: `${ROOT}/table-view-gate-bypass`,
};

const BY_STATUS_SLUG = `${ROOT}/table-view-tasks-by-status/:status`;

function feature(
  name: string,
  api: string,
  demo: string,
  since?: string,
): PlaygroundFeature {
  return { area: AREA, feature: name, api, demo, since };
}

const FORMS_AND_CONTAINERS: PlaygroundFeature[] = [
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

const LAYOUT_AND_PAGING: PlaygroundFeature[] = [
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

const FILTERS_TABS_VIEWS: PlaygroundFeature[] = [
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

const EMPTY_STATES_AND_REALTIME: PlaygroundFeature[] = [
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

const ROW_ACTIONS: PlaygroundFeature[] = [
  feature(
    "Built-in row actions",
    "rowActions: { add, edit, details, duplicate, copyLink, delete }",
    PAGES.drawer,
  ),
  feature(
    "Inline row action buttons",
    "rowActions.edit: { isVisible: true }",
    PAGES.kanban,
  ),
  feature(
    "Row actions gated by rules",
    "rowActions.delete: { isEnabled, rule: { and: [...] } }",
    PAGES.rules,
  ),
  feature(
    "Rule operators in, notIn and not",
    "rule: { field, in | notIn: [...] } / { not: rule }",
    PAGES.actions,
  ),
  feature(
    "Built-in action renamed",
    'rowActions.edit: { label: "Rename", icon }',
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Delete confirmation worded by the server",
    "rowActions.delete: { confirm: { from } }",
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Toast after a bulk built-in action",
    "rowActions.delete: { successMessage }",
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Add button in the page header",
    'rowActions.add: { placement: "header" }',
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Row menu accessible name",
    'rowActions: { menuLabel: "Actions for {name}" }',
    PAGES.actions,
    REQUEST_LOG_GAPS,
  ),
  feature(
    "Archive and restore instead of delete",
    "TableView({ archiveMode: true }) + @ArchiveField",
    PAGES.archive,
  ),
  feature("Row selection", "rowActions: { hasSelection: true }", PAGES.actions),
  feature(
    "Inline custom action with label, variant and color",
    "custom: [{ id, isVisible, showLabel, variant, color, rule }]",
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Custom action calling a route",
    'custom: [{ target: { type: "api", method, successMessage } }]',
    PAGES.actions,
  ),
  feature(
    "Route answer copied to the clipboard",
    'target: { type: "api", copy: "url" }',
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Custom action confirmed first",
    "custom: [{ confirm: { title, description, color, confirmLabel, cancelLabel } }]",
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Custom action gated by a permission",
    'custom: [{ permission: "edit" }]',
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Custom action label naming the row",
    'custom: [{ label: "Cancel {name}" }]',
    PAGES.actions,
    REQUEST_LOG_GAPS,
  ),
  feature(
    "File downloaded with the user's session",
    'target: { type: "download", url, filename }',
    PAGES.actions,
    DOWNLOAD_TARGET,
  ),
  feature(
    "Row opened in a module's modal",
    'target: { type: "modal", size, component }',
    PAGES.actions,
  ),
  feature(
    "Custom action running a quick action",
    'target: { type: "quickAction", id }',
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Link filled with the row's fields",
    'target: { type: "page", url: ".../{{row.status}}" }',
    PAGES.actions,
    PAGE_TOKENS,
  ),
  feature(
    "Bulk action opening a drawer on the selection",
    'custom: [{ bulk: true, target: { type: "drawer" } }] (selection prop)',
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    'Bulk action on "all N matching" rows',
    "custom: [{ bulk: { allMatching: true } }] + resolveBulkRowIds",
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Row drawer, deep-linked, stepping with J / K",
    'custom: [{ isDefault, deepLink, target: { type: "drawer" } }] (navigation prop)',
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Drawer from the right edge",
    'target: { type: "drawer", direction: "right" }',
    PAGES.views,
    SOURCE_TOKENS,
  ),
  feature(
    "Rows read in a side panel",
    'target: { type: "sidePanel", title, rowTitle, positionLabel }',
    PAGES.requestLog,
    SIDE_PANEL,
  ),
  feature(
    "Side panel state for a missing row",
    "sidePanel.notFound: { title, description }",
    `${PAGES.requestLog}?record=nope`,
    REQUEST_LOG_GAPS,
  ),
  feature(
    "Single click runs the row's action",
    'TableView({ rowClick: "single" })',
    PAGES.requestLog,
    SIDE_PANEL,
  ),
  feature(
    "Panel showing another row in place",
    "showRow(row | id) prop",
    PAGES.requestLog,
    LATEST,
  ),
  feature(
    "Toolbar buttons calling a route, confirmed",
    "customButtons: [{ id, label, variant, permission, confirm, target }]",
    PAGES.actions,
  ),
  feature(
    "Button disabled with a reason, or hidden",
    "customButtons: [{ availability: () => ({ reason } | { hidden: true }) }]",
    PAGES.actions,
  ),
  feature(
    "Button gated by an absolute permission",
    "customButtons: [{ permissionId }]",
    PAGES.actions,
  ),
  feature(
    "Table button in the page header",
    'customButtons: [{ placement: "header" }]',
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Quick action pressing a table button",
    'QuickAction({ target: { type: "button", page, button } })',
    PAGES.actions,
    V2_DESIGN,
  ),
  feature(
    "Server guards before each write",
    "TableView({ guards: { get, new, edit, delete } })",
    PAGES.rules,
  ),
  feature(
    "Guard refusal shown under its form field",
    "throw new HTTPResult(400, { message, field })",
    PAGES.rules,
    V2_DESIGN,
  ),
  feature(
    "Work run after a guarded write",
    "guard returning an AfterWrite",
    PAGES.rules,
    V2_DESIGN,
  ),
  feature(
    "Whole request refused when one row fails its rule",
    "TableView({ strictRuleValidation: true })",
    PAGES.rules,
  ),
];

const DISPLAYS_AND_CARDS: PlaygroundFeature[] = [
  feature(
    "Kanban board with drag and drop",
    "TableView({ kanban: { groupByField } })",
    PAGES.kanban,
  ),
  feature(
    "Kanban column height",
    'kanban: { columnMaxHeight: "420px" }',
    PAGES.kanban,
  ),
  feature(
    "Read-only board grouped by a boolean",
    "kanban: { groupByField: <boolean column>, draggable: false }",
    PAGES.kanban,
  ),
  feature("Card fields", "TableView({ card: { fields } })", PAGES.kanban),
  feature(
    "Custom card component",
    "card: { component: CustomComponent(...) }",
    PAGES.kanbanCards,
    V2_DESIGN,
  ),
  feature(
    "Built-in cards display",
    'displays: [{ id: "table" }, { id: "cards" }]',
    PAGES.kanbanCards,
    V2_DESIGN,
  ),
  feature(
    "Displays without the grid",
    'displays: [{ id: "cards" }] (no { id: "table" })',
    PAGES.kanbanCards,
    LATEST,
  ),
  feature(
    "Cards running their row's custom actions",
    "card props actions.customFor(row) / actions.custom(action, row)",
    PAGES.kanbanCards,
    CARD_ACTIONS,
  ),
  feature(
    "Module display running row actions",
    "display context actions.customFor / actions.custom",
    PAGES.moduleDisplay,
    CARD_ACTIONS,
  ),
  feature(
    "Module's own table display",
    'displays: [{ id: "table" }, { id: "<module>:<id>", component }] + registerTableViewDisplay',
    PAGES.moduleDisplay,
  ),
  feature(
    "Rows ordered by hand",
    'TableView({ reorder: { field: "position" } })',
    PAGES.reorder,
    V2_DESIGN,
  ),
  feature(
    "Cards ordered by hand",
    "reorder + cards display (card reorder prop)",
    PAGES.reorder,
    CARD_REORDER,
  ),
  feature(
    "Cells edited in the grid, each saved at once",
    "TableView({ inlineEdit: true | { columns } })",
    PAGES.inlineEdit,
  ),
  feature(
    "Editable cells drawn as their inputs",
    'TableView({ inlineEdit: { inputs: "always" } })',
    PAGES.inlineEdit,
  ),
  feature(
    "Rows opened from their actions only, not by a click",
    'TableView({ rowClick: "none" })',
    PAGES.inlineEdit,
  ),
];

const CELLS: PlaygroundFeature[] = [
  feature(
    "Identity cell: avatar, badges, You tag",
    "DefaultDisplays.IdentityDisplay({ avatarField, subtitleField, badges, selfField, selfLabel })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Empty identity",
    "IdentityDisplay({ emptyLabel, emptyIcon })",
    PAGES.cells,
    SUBLINES,
  ),
  feature(
    "Identity icon read from the row",
    "IdentityDisplay({ iconField, icon })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Two-line cell",
    "DefaultDisplays.TwoLineDisplay({ primaryField, subField, emptyLabel })",
    PAGES.cells,
    SUBLINES,
  ),
  feature(
    "Composed and toned sub-lines",
    "ComposedText / CellSubline { text, tone } row fields",
    PAGES.cells,
    SUBLINES,
  ),
  feature(
    "Status pill with a sub-line",
    "DefaultDisplays.StatusPillDisplay({ tones, subField, subTone, liveValues })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Status pill toned by the row",
    "StatusPillDisplay({ toneField })",
    PAGES.requestLog,
    SOURCE_TOKENS,
  ),
  feature(
    "On / off indicator",
    "DefaultDisplays.IndicatorDisplay({ onLabel, offLabel, onIcon, offIcon })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Relative date with now, soon, past and author",
    "DefaultDisplays.RelativeDateDisplay({ nowWithinMs, soonWithinMs, pastTone, byField })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Duration in ms or s, toned by the row",
    'DefaultDisplays.DurationDisplay({ unit: "s", format: "ms", toneField })',
    PAGES.cells,
    SIDE_PANEL,
  ),
  feature(
    "Text toned by the row",
    "DefaultDisplays.TextDisplay({ toneField })",
    PAGES.cells,
    SIDE_PANEL,
  ),
  feature(
    "Pills: related rows, exclusive pill, empty label",
    "DefaultDisplays.PillsDisplay({ labelKey, exclusive, emptyLabel })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Pills styled per row",
    "PillsDisplay + PillItem { tone, variant }",
    PAGES.views,
    SOURCE_TOKENS,
  ),
  feature(
    "Progress bar",
    "DefaultDisplays.ProgressDisplay({ doneField, totalField, errorField })",
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Sparkline",
    "DefaultDisplays.SparklineDisplay({ field, tone })",
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Bytes and mono cells",
    "DefaultDisplays.BytesDisplay() / MonoDisplay({ copy })",
    PAGES.views,
    V2_DESIGN,
  ),
  feature(
    "Module's own cell display",
    '@RegisterDisplay("<module>:<id>") + registerDataType',
    PAGES.cells,
    V2_DESIGN,
  ),
  feature(
    "Status, tags and color columns",
    "StatusType / TagsType / ColorType columns",
    PAGES.cells,
  ),
  feature("Search with a compare mode", '@Searchable("is")', PAGES.cells),
];

const SOURCES: PlaygroundFeature[] = [
  feature(
    "Rows read from a module route",
    "TableView.fromSource({ fetchUrl })",
    PAGES.sources,
    V2_DESIGN,
  ),
  feature(
    "Source filtered by the route, searched by the browser",
    "fromSource({ capabilities: { filter: true } })",
    PAGES.sources,
    V2_DESIGN,
  ),
  feature(
    "Source URL naming the page query",
    "fetchUrl: ...?route={{query.route}}",
    PAGES.sources,
    SOURCE_TOKENS,
  ),
  {
    ...feature(
      "Source URL naming a route parameter",
      "fetchUrl: ...?exclude={{params.status}}",
      PAGES.byStatus,
      SOURCE_TOKENS,
    ),
    slug: BY_STATUS_SLUG,
  },
  feature(
    "Source searching, sorting and paging on the server",
    "fromSource({ capabilities: { search, sort, paginate } })",
    PAGES.requestLog,
    V2_DESIGN,
  ),
  feature(
    "Source row read by id for a deep link",
    'fromSource({ fetchRowUrl: ".../{{row.id}}" })',
    `${PAGES.requestLog}?record=req-3`,
    REQUEST_LOG_GAPS,
  ),
  feature(
    "Source rows keyed by another field",
    'fromSource({ rowIdKey: "requestId" })',
    PAGES.requestLog,
  ),
  feature(
    "Source following a period selector",
    "fromSource({ periodScope })",
    PAGES.requestLog,
    SIDE_PANEL,
  ),
  feature(
    "Source route answering held rows",
    "liveHeldAt query parameter",
    PAGES.requestLog,
    SIDE_PANEL,
  ),
  feature(
    "Header button refreshing the page's tables",
    "DefaultLayout({ headerActions }) api target",
    PAGES.sources,
    SOURCE_TOKENS,
  ),
];

const DATA_AND_TENANCY: PlaygroundFeature[] = [
  feature(
    "Relation column resolving its rows",
    "RelationType({ dataApiController, keyMapping })",
    PAGES.users,
  ),
  feature(
    "Relation on a non-_id key",
    "RelationType({ index }) + @Select()",
    PAGES.relationKey,
  ),
  feature(
    "Relation to the tenant's members",
    "RelationType over memberSettingDataAPI",
    PAGES.relationMember,
  ),
  feature(
    "Cascader picker over a category tree",
    "CascaderRelationType",
    PAGES.cascaderProducts,
  ),
  feature(
    "Self-referencing category tree",
    "CascaderRelationType parent relation",
    PAGES.cascaderCategories,
  ),
  feature(
    "Table readable while the tenant is gated",
    "TableView({ bypassTenantAccessGate: true })",
    PAGES.gateBypass,
  ),
];

export const TABLE_VIEW_FEATURES: PlaygroundFeature[] = [
  ...FORMS_AND_CONTAINERS,
  ...LAYOUT_AND_PAGING,
  ...FILTERS_TABS_VIEWS,
  ...EMPTY_STATES_AND_REALTIME,
  ...ROW_ACTIONS,
  ...DISPLAYS_AND_CARDS,
  ...CELLS,
  ...SOURCES,
  ...DATA_AND_TENANCY,
];
