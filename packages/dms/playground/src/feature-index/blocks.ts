import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.blocks;

const STAT_GROUP = "/blocks/blocks-stat-group";
const KEY_VALUE = "/blocks/blocks-key-value";
const NAV_CARDS = "/blocks/blocks-nav-cards";
const FEEDBACK = "/blocks/blocks-feedback";
const ACTIVITY = "/blocks/blocks-activity";
const METERS = "/blocks/blocks-meters";
const SETTINGS = "/blocks/blocks-settings";
const CODE = "/blocks/blocks-code";
const GUARD = "/blocks/blocks-guard";
const LIVE = "/blocks/blocks-live";
const RECORD = "/blocks/blocks-record";
const CATALOG = "/blocks/blocks-catalog";
const CHART_DASHBOARD = "/charts/chart-dashboard";
const CHART_XY = "/charts/chart-xy";
const CHART_CIRCULAR = "/charts/chart-circular";
const CHART_REALTIME = "/charts/chart-realtime";
const CHART_ADVANCED = "/charts/chart-advanced";
const CHART_OPTIONS = "/charts/chart-options";
const CHART_CARDS = "/charts/chart-card-kpi";
const CHART_TOP_LIST = "/charts/chart-top-list";
const CHART_PERIOD = "/charts/chart-period";
const CHART_METRICS = "/charts/chart-metrics";
const CHART_STATIC = "/charts/chart-static";
const CHART_SCOPES = "/charts/chart-multi-scope";
const GRID_SIMPLE = "/grid/layout-grid-simple";
const GRID_STACKED = "/grid/layout-grid-stacked";
const GRID_HYBRID = "/grid/layout-grid-hybrid";
const GRID_SPACER = "/grid/grid-spacer";
const GRID_DENSE = "/grid/grid-dense";
const HSTACK = "/stack/stack-hstack";
const VSTACK = "/stack/stack-vstack";
const SPACER = "/stack/stack-spacer";
const STACK_COMBINED = "/stack/stack-combined";
const TABS_BASIC = "/tabs/tabs-basic";
const TABS_COUNTS = "/tabs/tabs-counts";
const TABS_KEEP_ALIVE = "/tabs/tabs-keep-alive";
const TABS_PERSIST = "/tabs/tabs-persist";
const TABS_VARIANTS = "/tabs/tabs-variants";
const MULTI_COMPONENT = "/multi-component/multi-component";

function feature(
  name: string,
  api: string,
  demo: string,
  since?: string,
): PlaygroundFeature {
  return { area: AREA, feature: name, api, demo, since };
}

const PLUMBING: PlaygroundFeature[] = [
  feature(
    "Link buttons on a block (route, #anchor, URL)",
    "actions: [{ label, to, icon }]",
    FEEDBACK,
    "0.6.0",
  ),
  feature(
    "Link button variant and colour",
    "actions: [{ variant, color }]",
    FEEDBACK,
    "0.6.0",
  ),
  feature("Items read from a module route", "fetchUrl", STAT_GROUP, "0.6.0"),
  feature(
    "Request method of a block route",
    "fetchUrlMethod: HttpMethod.get",
    KEY_VALUE,
  ),
  feature(
    "Loading skeleton sized to the answer",
    "skeletonCount",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Empty text of a fetched list",
    "empty: { title, description }",
    STAT_GROUP,
    "0.6.0",
  ),
  feature(
    "Load error with a Retry button (5xx)",
    "a fetchUrl answering 503",
    STAT_GROUP,
    "0.7.10",
  ),
  feature(
    "404 drawn as not found, reworded by the route",
    "404 body { message, emptyState }",
    ACTIVITY,
    "0.7.10",
  ),
  feature(
    "Route parameter token in a block URL",
    'fetchUrl: "/api/x/{{params.id}}"',
    RECORD,
    "0.6.1",
  ),
  feature(
    "Query token in a block URL, nothing read while unset",
    'fetchUrl: "/api/x?status={{query.status}}"',
    `${RECORD}?status=paid`,
    "0.6.1",
  ),
  feature(
    "Unknown record: every block says not found",
    "{{params.id}} route answering 404",
    RECORD,
    "0.7.10",
  ),
  feature(
    "Page blocks read again after a form saves",
    ".watch(FormEvents.SUBMIT_SUCCESS, BlockFunctions.REFRESH_PAGE)",
    SETTINGS,
    "0.6.1",
  ),
  feature(
    "Page blocks read again on a tab change",
    ".watch(TabEvents.TAB_CHANGE, BlockFunctions.REFRESH_PAGE)",
    TABS_BASIC,
  ),
  feature(
    "Page blocks read again after a header action",
    'headerActions target { type: "api" }',
    KEY_VALUE,
    "0.6.1",
  ),
];

const PERIOD_AND_REALTIME: PlaygroundFeature[] = [
  feature(
    "StatGroup following a period selector",
    "StatGroup({ periodScope })",
    STAT_GROUP,
    "0.7.2",
  ),
  feature(
    "KeyValueList following a period selector",
    "KeyValueList({ periodScope })",
    KEY_VALUE,
    "0.7.2",
  ),
  feature(
    "ActivityFeed following a period selector",
    "ActivityFeed({ periodScope })",
    ACTIVITY,
    "0.7.2",
  ),
  feature(
    "Meter following a period selector",
    "Meter({ periodScope })",
    METERS,
    "0.7.2",
  ),
  feature(
    "Guard following a period selector",
    "Guard({ periodScope })",
    GUARD,
    "0.7.10",
  ),
  feature(
    "KeyValueList refreshed over realtime",
    "KeyValueList({ realtimeTopic })",
    KEY_VALUE,
    "0.7.2",
  ),
  feature(
    "NavCardGrid refreshed over realtime",
    "NavCardGrid({ realtimeTopic })",
    NAV_CARDS,
    "0.7.2",
  ),
  feature(
    "ActivityFeed refreshed over realtime",
    "ActivityFeed({ realtimeTopic })",
    ACTIVITY,
    "0.7.2",
  ),
  feature(
    "Meter refreshed over realtime",
    "Meter({ realtimeTopic })",
    METERS,
    "0.7.2",
  ),
  feature(
    "StatGroup refreshed over realtime",
    "StatGroup({ realtimeTopic })",
    LIVE,
    "0.7.2",
  ),
  feature(
    "Banner content refreshed over realtime",
    "Banner({ fetchUrl, realtimeTopic })",
    FEEDBACK,
    "0.7.2",
  ),
  feature(
    "Tab badges refreshed over realtime",
    "Tab({ badgesUrl, realtimeTopic })",
    TABS_COUNTS,
    "0.7.2",
  ),
  feature(
    "Guard checked again over realtime",
    "Guard({ realtimeTopic })",
    GUARD,
    "0.7.10",
  ),
  feature(
    "Chart refreshed over realtime",
    "ChartArea({ realtimeTopic })",
    CHART_REALTIME,
  ),
  feature(
    "ChartCard refreshed over realtime",
    "ChartCard({ realtimeTopic })",
    CHART_CARDS,
    "0.7.13",
  ),
  feature(
    "TopListCard refreshed over realtime",
    "TopListCard({ realtimeTopic })",
    CHART_TOP_LIST,
    "0.7.2",
  ),
];

const COMPOSED_TEXTS: PlaygroundFeature[] = [
  feature(
    "Text composed in the reader's language",
    "{ key, params }",
    ACTIVITY,
    "0.6.2",
  ),
  feature(
    "i18n key as a block text",
    '"$demo.blocks.nav.billing"',
    NAV_CARDS,
    "0.6.2",
  ),
  feature(
    "Money parameter",
    '{ type: "money", value, currency }',
    STAT_GROUP,
    "0.6.2",
  ),
  feature(
    "Date parameter (day, short)",
    '{ type: "date", format }',
    NAV_CARDS,
    "0.6.2",
  ),
  feature(
    "Datetime parameter (long)",
    '{ type: "datetime", format: "long" }',
    STAT_GROUP,
    "0.6.2",
  ),
  feature(
    "Relative time parameter",
    '{ type: "relative", value }',
    CHART_TOP_LIST,
    "0.6.2",
  ),
  feature(
    "Number parameter (percent, compact)",
    '{ type: "number", format }',
    KEY_VALUE,
    "0.6.2",
  ),
  feature(
    "Count parameter picking the plural form",
    '{ type: "count", value }',
    ACTIVITY,
    "0.6.2",
  ),
  feature(
    "Explicit plural parameter and a nested text",
    "{ key, params: { x: { key } }, plural }",
    FEEDBACK,
    "0.6.2",
  ),
  feature(
    "$-key title with the entry's params",
    '{ title: "$key", params }',
    ACTIVITY,
    "0.7.2",
  ),
];

const STAT_GROUP_FEATURES: PlaygroundFeature[] = [
  feature(
    "Joined status strip",
    'StatGroup({ layout: "joined" })',
    STAT_GROUP,
    "0.6.0",
  ),
  feature(
    "Summary cards",
    'StatGroup({ layout: "cards", columns })',
    STAT_GROUP,
    "0.6.0",
  ),
  feature(
    "Accessible group label",
    "StatGroup({ label })",
    STAT_GROUP,
    "0.6.0",
  ),
  feature(
    "Well tones, muted included",
    "items: [{ icon, tone }]",
    STAT_GROUP,
    "0.6.0",
  ),
  feature(
    "Eyebrow, value, detail and detail tone",
    "items: [{ eyebrow, value, detail, detailTone }]",
    STAT_GROUP,
    "0.6.0",
  ),
  feature("Stat cell as a link", "items: [{ to }]", STAT_GROUP, "0.6.0"),
  feature("Stable item ids", "items: [{ id }]", STAT_GROUP, "0.6.0"),
  feature(
    "Long detail wrapping to two lines",
    "items: [{ detail }]",
    STAT_GROUP,
    "0.7.6",
  ),
  feature(
    "Composed eyebrow, value and detail",
    "items: [{ value: { key, params } }]",
    STAT_GROUP,
    "0.6.2",
  ),
];

const KEY_VALUE_FEATURES: PlaygroundFeature[] = [
  feature(
    "Value types: text, status, money, date, link, mono",
    "items: [{ type }]",
    KEY_VALUE,
    "0.6.0",
  ),
  feature("Status and text tones", "items: [{ tone }]", KEY_VALUE, "0.6.0"),
  feature("Row detail and link", "items: [{ detail, to }]", KEY_VALUE, "0.6.0"),
  feature(
    "Copy button on a row",
    "items: [{ copy: true }]",
    KEY_VALUE,
    "0.7.2",
  ),
  feature(
    "Copy a value other than the one shown",
    "items: [{ copyValue }]",
    KEY_VALUE,
    "0.7.2",
  ),
  feature(
    "Row currency and list currency",
    "items: [{ currency }], currency",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Two and three columns",
    "KeyValueList({ columns })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Dense rows without a card",
    "KeyValueList({ dense, card: false })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Composed label and value",
    'items: [{ label: "$key", value: { key, params } }]',
    KEY_VALUE,
    "0.7.2",
  ),
  feature(
    "Empty fetched list",
    "KeyValueList({ fetchUrl, empty })",
    KEY_VALUE,
    "0.6.0",
  ),
];

const NAV_CARD_FEATURES: PlaygroundFeature[] = [
  feature(
    "Settings-style navigation cards with a state",
    "NavCardGrid({ items: [{ icon, title, description, to, state, stateTone }] })",
    NAV_CARDS,
    "0.6.0",
  ),
  feature(
    "Card tag, icon tone and readout",
    "items: [{ tag, iconTone, readout }]",
    NAV_CARDS,
    "0.6.0",
  ),
  feature(
    "Grid columns, title and description",
    "NavCardGrid({ columns, title, description })",
    NAV_CARDS,
    "0.6.0",
  ),
  feature(
    "Cards and states read from a route",
    "NavCardGrid({ fetchUrl })",
    NAV_CARDS,
    "0.6.0",
  ),
  feature(
    "One card per page of a category",
    "NavCardGrid({ category })",
    NAV_CARDS,
  ),
  feature("Empty grid text", "NavCardGrid({ empty })", NAV_CARDS, "0.6.0"),
];

const ACTIVITY_FEATURES: PlaygroundFeature[] = [
  feature(
    "Feed with day separators and unread dots",
    "ActivityFeed({ items: [{ date, unread }] })",
    ACTIVITY,
    "0.6.0",
  ),
  feature(
    "Entry icon, tone, meta and link",
    "items: [{ icon, tone, meta, to }]",
    ACTIVITY,
    "0.6.0",
  ),
  feature(
    "Flat feed limited to N entries",
    "ActivityFeed({ groupByDay: false, maxItems })",
    ACTIVITY,
    "0.6.0",
  ),
  feature(
    "View all link in the head",
    "ActivityFeed({ actions })",
    ACTIVITY,
    "0.6.0",
  ),
  feature("Mono log lines", "ActivityFeed({ mono: true })", ACTIVITY, "0.6.0"),
  feature("Third mono detail line", "items: [{ detail }]", ACTIVITY, "0.7.10"),
  feature("Text in place of the time", "items: [{ time }]", ACTIVITY, "0.7.10"),
  feature(
    "Head badge and count",
    "ActivityFeed({ badge, count })",
    ACTIVITY,
    "0.7.10",
  ),
  feature(
    "Count answered by the route",
    "{ items, count }",
    ACTIVITY,
    "0.7.10",
  ),
  feature(
    '"Show N more"',
    "ActivityFeed({ visibleItems })",
    ACTIVITY,
    "0.7.12",
  ),
  feature(
    "Wrapped long lines",
    "ActivityFeed({ wrap: true })",
    ACTIVITY,
    "0.7.12",
  ),
  feature(
    "Feed filling the row height",
    "ActivityFeed({ fillHeight: true })",
    ACTIVITY,
    "0.7.10",
  ),
  feature(
    "Feed without a card",
    "ActivityFeed({ card: false })",
    ACTIVITY,
    "0.6.0",
  ),
];

const METER_FEATURES: PlaygroundFeature[] = [
  feature(
    "Stacked segments with a legend",
    "Meter({ segments, legend: true })",
    METERS,
    "0.6.0",
  ),
  feature(
    "Segment tones (soft, success, warning, error)",
    "segments: [{ tone }]",
    METERS,
    "0.6.0",
  ),
  feature(
    "Value formats: fraction, percent, value, none",
    "Meter({ format })",
    METERS,
    "0.6.0",
  ),
  feature("Single-value tone", "Meter({ tone })", METERS, "0.6.0"),
  feature(
    "Warning and error thresholds",
    "Meter({ warnAt, errorAt })",
    METERS,
    "0.6.0",
  ),
  feature("Sizes xs, sm, md", "Meter({ size })", METERS, "0.6.0"),
  feature("Custom value label", "Meter({ valueLabel })", SETTINGS, "0.6.0"),
  feature(
    "Figures merged from a route",
    "Meter({ fetchUrl })",
    METERS,
    "0.6.0",
  ),
  feature("Composed hint", "Meter({ hint: { key, params } })", METERS, "0.7.2"),
  feature(
    "Meter card with link buttons",
    "Meter({ card: true, actions })",
    METERS,
    "0.6.0",
  ),
];

const BANNER_FEATURES: PlaygroundFeature[] = [
  feature("Banner tones and icon", "Banner({ tone, icon })", FEEDBACK, "0.6.0"),
  feature("Compact banner", 'Banner({ size: "sm" })', FEEDBACK, "0.6.0"),
  feature(
    "Remembered dismiss",
    "Banner({ dismissible, dismissKey })",
    FEEDBACK,
    "0.6.0",
  ),
  feature(
    "Dismiss remembered under the block id",
    "Banner({ dismissible: true })",
    FEEDBACK,
    "0.6.0",
  ),
  feature(
    "Banner content read from a route",
    "Banner({ fetchUrl })",
    FEEDBACK,
    "0.7.2",
  ),
  feature(
    "Route answering {} draws no banner",
    "Banner({ fetchUrl }) answering {}",
    RECORD,
    "0.7.2",
  ),
  feature(
    "Banner button calling a route with a confirm",
    "actions: [{ target, confirm }]",
    FEEDBACK,
    "0.7.2",
  ),
  feature(
    "Composed banner title and description",
    "{ title: { key, params } }",
    FEEDBACK,
    "0.7.2",
  ),
];

const CONTAINER_FEATURES: PlaygroundFeature[] = [
  feature(
    "Card with title, count, description, actions and footer",
    "Card({ title, count, description, actions, footer })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature("Elevated card", 'Card({ variant: "elevated" })', KEY_VALUE, "0.6.0"),
  feature(
    "Blocks in the card's actions slot",
    ".child(id, block, { slot: CARD_ACTIONS_SLOT })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Blocks in the card's footer slot",
    ".child(id, block, { slot: CARD_FOOTER_SLOT })",
    KEY_VALUE,
    "0.6.0",
  ),
  feature(
    "Settings section and danger zone",
    "Section({ title, description, danger })",
    SETTINGS,
    "0.6.0",
  ),
  feature(
    "Section without a card",
    "Section({ card: false })",
    SETTINGS,
    "0.6.0",
  ),
  feature(
    "Field row layouts form and stack",
    "FieldRow({ layout })",
    SETTINGS,
    "0.6.0",
  ),
  feature(
    "Required and disabled field rows",
    "FieldRow({ required, disabled })",
    SETTINGS,
    "0.6.0",
  ),
  feature(
    "Field row without a label spanning both columns",
    'FieldRow({ layout: "form" })',
    SETTINGS,
    "0.7.8",
  ),
  feature(
    "Several blocks on one page",
    "static blocks of a PageController",
    MULTI_COMPONENT,
  ),
];

const EMPTY_AND_CODE_FEATURES: PlaygroundFeature[] = [
  feature(
    "Empty state variants: no-data, no-result, no-access, error",
    "EmptyState({ variant })",
    FEEDBACK,
    "0.6.0",
  ),
  feature(
    "Empty state icon, tone, hatch and sizes",
    "EmptyState({ icon, tone, hatched, size })",
    FEEDBACK,
    "0.6.0",
  ),
  feature("Empty state actions", "EmptyState({ actions })", FEEDBACK, "0.6.0"),
  feature(
    "Empty state inside a card",
    "EmptyState({ card: false })",
    FEEDBACK,
    "0.6.0",
  ),
  feature(
    "Empty state with a snippet",
    "EmptyState({ code: { content, language, copy } })",
    CODE,
    "0.7.2",
  ),
  feature("Code block languages", "CodeBlock({ language })", CODE, "0.7.2"),
  feature(
    "Code block without copy button",
    "CodeBlock({ copy: false })",
    CODE,
    "0.7.2",
  ),
  feature(
    "Code block max lines and wrap",
    "CodeBlock({ maxLines, wrap })",
    CODE,
    "0.7.2",
  ),
  feature(
    "Code snippet read from a route",
    "CodeBlock({ fetchUrl })",
    CODE,
    "0.7.2",
  ),
  feature(
    "Composed code block title",
    "CodeBlock({ title: { key, params } })",
    CODE,
    "0.7.2",
  ),
  feature("Placeholder box", "Placeholder({ label, height, width })", HSTACK),
];

const GUARD_FEATURES: PlaygroundFeature[] = [
  feature(
    "Empty state in place of blocks while a value is empty",
    "Guard({ fetchUrl, field })",
    GUARD,
    "0.7.10",
  ),
  feature(
    "Guard fallback and route emptyState overlay",
    "Guard({ fallback }), answer { emptyState }",
    GUARD,
    "0.7.10",
  ),
  feature(
    "Guard on a whole empty answer, default fallback",
    "Guard({ fetchUrl })",
    GUARD,
    "0.7.10",
  ),
  feature(
    "Not found in place of a deleted record's blocks",
    'Guard({ when: "notFound" })',
    `${GUARD}?record=gone`,
    "0.7.10",
  ),
  feature(
    "Guard URL token, children shown while unset",
    'Guard({ fetchUrl: "...{{query.record}}" })',
    GUARD,
    "0.7.10",
  ),
  feature(
    "Several guarded children spaced like page blocks",
    "Guard().child().child()",
    GUARD,
    "0.7.11",
  ),
];

const LAYOUT_FEATURES: PlaygroundFeature[] = [
  feature(
    "Grid rows of blocks",
    "Grid({ gap }).child(id, GridRow())",
    GRID_STACKED,
  ),
  feature("Wide cells", "GridRow().child(id, block, { colSpan })", GRID_SPACER),
  feature(
    "Spacer cell in a grid row",
    "GridRow().child(id, Spacer())",
    GRID_SPACER,
  ),
  feature("Nested grids", "Grid inside a GridRow cell", GRID_HYBRID),
  feature("Grid with tabs beside a list", "Grid + Tab", GRID_SIMPLE),
  feature(
    "Columns wrapping below a minimum width",
    "Grid({ minColumnWidth })",
    GRID_DENSE,
  ),
  feature("Six KPI cards on one row", "GridRow with six KpiCards", GRID_DENSE),
  feature(
    "Horizontal stack alignment and spacing",
    "HStack({ alignment, spacing })",
    HSTACK,
  ),
  feature("Horizontal distributions", "HStack({ distribution })", HSTACK),
  feature("Wrapping horizontal stack", "HStack({ wrap: true })", HSTACK),
  feature("Vertical stack alignment", "VStack({ alignment })", VSTACK),
  feature("Vertical distributions", "VStack({ distribution })", VSTACK),
  feature("Spacer filling the free space", "Spacer()", SPACER),
  feature("Spacer size bounds", "Spacer({ minSize, maxSize })", SPACER),
  feature("Spacers sharing space by weight", "Spacer({ grow })", SPACER),
  feature(
    "Page layout from stacks only",
    "HStack + VStack + Spacer",
    STACK_COMBINED,
  ),
];

const TAB_FEATURES: PlaygroundFeature[] = [
  feature(
    "Tabs holding blocks per slot",
    "Tab({ items: [{ label, icon, slot }] })",
    TABS_BASIC,
  ),
  feature("Keyboard shortcut per tab", "items: [{ shortcut }]", TABS_BASIC),
  feature("Disabled tab", "items: [{ disabled: true }]", TABS_VARIANTS),
  feature(
    "Pill and link variants",
    "Tab({ variant: TabVariant.pill })",
    TABS_VARIANTS,
  ),
  feature(
    "Vertical tabs, sizes and colours",
    "Tab({ orientation, size, color })",
    TABS_VARIANTS,
  ),
  feature("Badges: number, text, styled", "items: [{ badge }]", TABS_VARIANTS),
  feature(
    "Badge as an i18n key or a composed count",
    "items: [{ badge: { key, params } }]",
    TABS_VARIANTS,
    "0.7.12",
  ),
  feature("Avatar on a tab", "items: [{ avatar }]", TABS_VARIANTS),
  feature(
    "Tabs spread over the full width",
    "Tab({ fit: true })",
    TABS_VARIANTS,
    "0.7.6",
  ),
  feature(
    "Hidden tabs kept mounted",
    "Tab({ unmountOnHide: false })",
    TABS_KEEP_ALIVE,
  ),
  feature(
    "Selected tab kept in the URL",
    "Tab({ persistState, stateKey })",
    TABS_PERSIST,
  ),
  feature(
    "Selected tab under the default ?tab= key",
    "Tab({ persistState: true })",
    TABS_PERSIST,
    "0.7.12",
  ),
  feature(
    "Tab badges read from one route",
    "Tab({ badgesUrl })",
    TABS_COUNTS,
    "0.6.0",
  ),
  feature(
    "Tab badges read for the page's record",
    'Tab({ badgesUrl: "...{{params.id}}" })',
    RECORD,
    "0.6.1",
  ),
];

const CHART_TYPE_FEATURES: PlaygroundFeature[] = [
  feature(
    "Line, area, bar, column and scatter charts",
    "ChartLine, ChartArea, ChartBar, ChartColumn, ChartScatter",
    CHART_XY,
  ),
  feature(
    "Donut, pie and radial bar charts",
    "ChartDonut, ChartPie, ChartRadialBar",
    CHART_CIRCULAR,
  ),
  feature(
    "Mixed, radar, heatmap and candlestick charts",
    "ChartMixed, ChartRadar, ChartHeatmap, ChartCandlestick",
    CHART_ADVANCED,
  ),
  feature("Range area bands", "ChartRangeArea", CHART_METRICS),
  feature(
    "Mixed series types, a range area among them",
    "ChartMixed({ seriesDefs: [{ type: ChartType.RANGE_AREA }] })",
    CHART_METRICS,
  ),
  feature("Charts drawn from inline data", "staticDataset", CHART_STATIC),
  feature("Static heatmap", "ChartHeatmap({ staticDataset })", CHART_OPTIONS),
  feature("Chart read with a request method", "fetchUrlMethod", CHART_REALTIME),
  feature("Chart following a period selector", "periodScope", CHART_METRICS),
];

const CHART_OPTION_FEATURES: PlaygroundFeature[] = [
  feature("Colours: names, arrays, hex", "color", CHART_XY),
  feature(
    "Colours: shade tokens, CSS variables, rgb() and hsl()",
    'color: "primary-300" | "--ui-primary" | "rgb(...)"',
    CHART_OPTIONS,
  ),
  feature("Fixed chart width", "width", CHART_OPTIONS),
  feature(
    "Tooltip, legend and grid toggles",
    "showTooltip, showLegend, showGrid",
    CHART_OPTIONS,
  ),
  feature(
    "Legend under the chart",
    'legendPosition: "bottom"',
    CHART_OPTIONS,
    "0.7.12",
  ),
  feature(
    "Fixed and automatic Y range",
    "yRange, autoYRange: { padding }",
    CHART_OPTIONS,
  ),
  feature(
    "Comparison series styles",
    "comparisonStyle: dashed | solid | dimmed",
    CHART_SCOPES,
  ),
  feature(
    "Smooth, straight and stepline curves",
    "smooth, curve",
    CHART_METRICS,
  ),
  feature(
    "Reference lines, bands and dashed lines",
    "annotations: [{ y, y2, label, color, dashed }]",
    CHART_OPTIONS,
  ),
  feature("Crosshair synced between charts", "syncGroup", CHART_METRICS),
  feature("Datetime, category and numeric X axes", "xaxisType", CHART_OPTIONS),
  feature(
    "X axis ticks, rotation and date format",
    "xAxis: { tickAmount, rotate, hideOverlappingLabels, datetimeFormat }",
    CHART_OPTIONS,
  ),
  feature(
    "Per-series colour, stroke width and dash",
    "staticDataset: [{ color, strokeWidth, strokeDashArray }]",
    CHART_OPTIONS,
  ),
  feature("Line stroke width", "ChartLine({ strokeWidth })", CHART_XY),
  feature(
    "Area opacity and stacking",
    "ChartArea({ fillOpacity, stacked })",
    CHART_OPTIONS,
  ),
  feature(
    "Range area opacity",
    "ChartRangeArea({ fillOpacity })",
    CHART_OPTIONS,
  ),
  feature(
    "Bar stacking, width, corners and orientation",
    "ChartBar({ stacked, barWidth, roundedCorners, orientation })",
    CHART_OPTIONS,
  ),
  feature(
    "Column stacking, width and corners",
    "ChartColumn({ stacked, columnWidth, roundedCorners })",
    CHART_XY,
  ),
  feature(
    "Scatter point size and labels",
    "ChartScatter({ pointSize, showLabels })",
    CHART_OPTIONS,
  ),
  feature(
    "Colour per mixed series",
    "ChartMixed({ seriesDefs: [{ color }] })",
    CHART_OPTIONS,
  ),
  feature("Radar fill opacity", "ChartRadar({ fillOpacity })", CHART_ADVANCED),
  feature(
    "Donut central labels and arc width",
    "ChartDonut({ centralLabel, centralSubLabel, arcWidth })",
    CHART_CIRCULAR,
  ),
  feature(
    "Radial bar total and hollow size",
    "ChartRadialBar({ showTotal, hollowSize })",
    CHART_OPTIONS,
  ),
  feature(
    "Heatmap shade intensity and distributed colours",
    "ChartHeatmap({ shadeIntensity, distributed })",
    CHART_OPTIONS,
  ),
  feature(
    "Raw ApexCharts options and CSS",
    "rawOptions, rawCss",
    CHART_OPTIONS,
  ),
  feature(
    "Slice and point click events",
    "ChartEvents.SEGMENT_CLICK, ChartEvents.POINT_CLICK",
    CHART_OPTIONS,
  ),
];

const CARD_FEATURES: PlaygroundFeature[] = [
  feature(
    "Chart in a card with its headline figure",
    "ChartCard({ chart, fetchUrl, valueFormat })",
    CHART_CARDS,
  ),
  feature(
    "ChartCard compared with the previous period",
    "ChartCard({ periodScope })",
    CHART_CARDS,
  ),
  feature(
    "Donut nested in a ChartCard",
    "ChartCard({ chart: ChartDonut() })",
    CHART_CARDS,
  ),
  feature(
    "ChartCard icon, no delta, no legend",
    "ChartCard({ icon, showDelta: false, showLegend: false })",
    CHART_CARDS,
  ),
  feature(
    "ChartCard series legend",
    "ChartCard({ showSeriesLegend: true })",
    CHART_CARDS,
    "0.7.12",
  ),
  feature(
    "ChartCard currency, precision and legend labels",
    "ChartCard({ currencyCode, valuePrecision, primaryLabel, comparisonLabel })",
    CHART_CARDS,
  ),
  feature(
    "KPI card with a static figure and delta",
    "KpiCard({ staticValue, staticDelta, compareLabel })",
    CHART_CARDS,
  ),
  feature(
    "KPI card read for a period",
    "KpiCard({ fetchUrl, periodScope })",
    CHART_DASHBOARD,
  ),
  feature("KPI stat variant", 'KpiCard({ variant: "stat" })', CHART_METRICS),
  feature(
    "KPI value formats",
    "KpiCard({ valueFormat: currency | compact | number | percent })",
    CHART_CARDS,
  ),
  feature(
    "KPI currency and native precision",
    'KpiCard({ currencyCode, valuePrecision: "native" })',
    CHART_CARDS,
  ),
  feature("KPI without delta", "KpiCard({ showDelta: false })", CHART_CARDS),
  feature(
    "KPI sparklines and their accent",
    "KpiCard({ showSparkline, staticSparkline, sparklineAccent })",
    CHART_CARDS,
  ),
  feature(
    "A fall shown as good news",
    "KpiCard({ invert: true })",
    CHART_CARDS,
  ),
  feature(
    "Card payloads built by the response helpers",
    "chartCardData(), kpiCardData()",
    CHART_CARDS,
  ),
  feature(
    "No delta after a period that measured nothing",
    "kpiCardData(points, { previous })",
    CHART_CARDS,
  ),
  feature(
    "Ranked list read for a period",
    "TopListCard({ fetchUrl, periodScope })",
    CHART_TOP_LIST,
  ),
  feature(
    "Rank, top N highlight and colours",
    "TopListCard({ showRank, highlightTopN, rankColor, badgeColor })",
    CHART_TOP_LIST,
  ),
  feature(
    "Ranked list delta and sparkline",
    "TopListCard({ showDelta, showSparkline })",
    CHART_TOP_LIST,
  ),
  feature(
    "Value suffix and proportion bars",
    "TopListCard({ valueSuffix, showBar })",
    CHART_TOP_LIST,
    "0.7.10",
  ),
  feature(
    "Rise shown as bad news, sparkline accent",
    "TopListCard({ invert, sparklineAccent })",
    CHART_TOP_LIST,
  ),
  feature(
    "Scrolling ranked list",
    "TopListCard({ maxHeight })",
    CHART_TOP_LIST,
  ),
  feature(
    "Ranked list currency and precision",
    "TopListCard({ currencyCode, valuePrecision })",
    CHART_TOP_LIST,
  ),
  feature(
    "Ranked list link buttons",
    "TopListCard({ actions })",
    CHART_TOP_LIST,
    "0.7.6",
  ),
  feature(
    "Ranked list skeleton and empty label",
    "TopListCard({ skeletonCount, emptyLabel })",
    CHART_TOP_LIST,
  ),
  feature(
    "Static ranked items with icons",
    "TopListCard({ staticItems })",
    CHART_TOP_LIST,
  ),
  feature(
    "Avatars and value labels on rows",
    "staticItems: [{ avatar, valueLabel }]",
    CHART_TOP_LIST,
    "0.7.10",
  ),
  feature(
    "Row links keeping the page's period",
    'staticItems: [{ to: "...{{query.x.period}}" }]',
    CHART_TOP_LIST,
    "0.7.14",
  ),
  feature(
    "Composed row descriptions",
    "items: [{ description: { key, params } }]",
    CHART_TOP_LIST,
    "0.7.2",
  ),
];

const PERIOD_FEATURES: PlaygroundFeature[] = [
  feature(
    "Period selector driving cards",
    "PeriodSelector({ id }) + periodScope",
    CHART_PERIOD,
  ),
  feature(
    "Default preset and comparison",
    "PeriodSelector({ defaultPreset, defaultComparison })",
    CHART_PERIOD,
  ),
  feature(
    "Rolling presets (last hour to last 90 days)",
    'presets: ["last-hour", ...]',
    CHART_METRICS,
  ),
  feature(
    "Calendar presets (today to last year)",
    'presets: ["today", "yesterday", "ytd", ...]',
    CHART_PERIOD,
  ),
  feature(
    "All-time preset sending no bounds",
    'presets: ["all"]',
    CHART_PERIOD,
    "0.7.10",
  ),
  feature(
    "Today rolling over at midnight",
    'presets: ["today"]',
    CHART_PERIOD,
    "0.7.16",
  ),
  feature("Comparisons offered, custom included", "comparisons", CHART_PERIOD),
  feature(
    "Comparison as a menu, a toggle or hidden",
    "PeriodSelector({ comparisonControl })",
    CHART_PERIOD,
    "0.7.10",
  ),
  feature(
    "Relabelled presets and comparisons",
    "PeriodSelector({ presetLabels, comparisonLabels })",
    CHART_PERIOD,
  ),
  feature(
    "Selector alignment and sizes",
    "PeriodSelector({ align, size })",
    CHART_PERIOD,
  ),
  feature(
    "Range shown beside the control",
    "PeriodSelector({ showRangeLabel })",
    CHART_PERIOD,
  ),
  feature(
    "Range written relative to now",
    'PeriodSelector({ rangeLabel: "relative" })',
    CHART_PERIOD,
    "0.7.10",
  ),
  feature(
    "Segmented presets",
    'PeriodSelector({ variant: "segmented" })',
    CHART_PERIOD,
  ),
  feature(
    "Custom range capped in days",
    "PeriodSelector({ maxDays })",
    CHART_PERIOD,
    "0.7.16",
  ),
  feature(
    "Remembered period shared between pages",
    "PeriodSelector({ rememberKey })",
    CHART_PERIOD,
    "0.7.10",
  ),
  feature("Period kept in the URL", "?<id>.period=", CHART_PERIOD, "0.7.8"),
  feature(
    "Link opening on a custom range",
    "?<id>.from=&<id>.to=",
    `${CHART_PERIOD}?period-right.from=2026-10-01&period-right.to=2026-10-03`,
    "0.7.16",
  ),
  feature(
    'Default "page" scope of a selector without id',
    'PeriodSelector() + periodScope: "page"',
    CHART_PERIOD,
  ),
  feature(
    "Two independent scopes on one page",
    "two PeriodSelector ids",
    CHART_SCOPES,
  ),
  feature(
    "Period scope owned by a module component",
    "usePeriod() + registerPeriodScope()",
    CHART_PERIOD,
  ),
  feature(
    "Period selector in a card head",
    "Card + PeriodSelector in CARD_ACTIONS_SLOT",
    KEY_VALUE,
  ),
];

const LIVE_FEATURES: PlaygroundFeature[] = [
  feature(
    "Live page capping refetches",
    "PageController({ live: { maxRate } })",
    LIVE,
    "0.7.8",
  ),
  feature("Live / Pause switch", "LiveToggle()", CHART_REALTIME, "0.7.8"),
  feature(
    "Live pill toggle",
    'LiveToggle({ variant: "pill" })',
    LIVE,
    "0.7.10",
  ),
  feature(
    "Toggle alignment, no update time",
    "LiveToggle({ align, showUpdatedAt: false })",
    LIVE,
    "0.7.8",
  ),
  feature(
    "Missed events named in the toggle",
    "LiveToggle({ missedLabel })",
    LIVE,
    "0.7.10",
  ),
  feature(
    "Slower cadence on long periods",
    "live: { slowRateAfter: { period, maxRate } }",
    LIVE,
    "0.7.10",
  ),
  feature(
    "Live choice shared between pages",
    "live: { rememberKey }",
    LIVE,
    "0.7.10",
  ),
  feature(
    "Missed count from payload.count and payload.ids",
    "PublishMessage(topic, type, { payload })",
    LIVE,
    "0.7.10",
  ),
  feature("Page opened paused", "?live=0", `${LIVE}?live=0`, "0.7.8"),
  feature(
    "Live gate on list blocks",
    "StatGroup / ActivityFeed realtimeTopic on a live page",
    LIVE,
    "0.7.8",
  ),
  feature(
    "Custom component following Live / Pause",
    "usePageLive(): isPaused, pauseReason, isPolling",
    LIVE,
    "0.7.10",
  ),
  feature(
    "Custom component holding the page paused",
    "usePageLive().hold(reason) / release()",
    LIVE,
    "0.7.10",
  ),
  feature(
    "Custom component naming what was missed",
    "usePageLive().setMissedDetail()",
    LIVE,
    "0.7.10",
  ),
  feature(
    "Custom component refetching like a block",
    "usePageLiveRefresh(refresh, { realtimeTopic, idleRefresh })",
    LIVE,
    "0.7.12",
  ),
];

const REGISTRY_FEATURES: PlaygroundFeature[] = [
  feature("Registered block types", "ListBlockTypes()", CATALOG),
  feature(
    "A block type's option descriptor",
    "GetBlockType(type)",
    `${CATALOG}?type=KpiCard`,
  ),
  feature(
    "Options checked against a block schema",
    "ValidateBlockOptions(type, options)",
    CATALOG,
  ),
  feature(
    "Data sources a page editor offers",
    "RegisterDataSource(), ListDataSources()",
    CATALOG,
  ),
];

export const BLOCKS_FEATURES: PlaygroundFeature[] = [
  ...PLUMBING,
  ...PERIOD_AND_REALTIME,
  ...COMPOSED_TEXTS,
  ...STAT_GROUP_FEATURES,
  ...KEY_VALUE_FEATURES,
  ...NAV_CARD_FEATURES,
  ...ACTIVITY_FEATURES,
  ...METER_FEATURES,
  ...BANNER_FEATURES,
  ...CONTAINER_FEATURES,
  ...EMPTY_AND_CODE_FEATURES,
  ...GUARD_FEATURES,
  ...LAYOUT_FEATURES,
  ...TAB_FEATURES,
  ...CHART_TYPE_FEATURES,
  ...CHART_OPTION_FEATURES,
  ...CARD_FEATURES,
  ...PERIOD_FEATURES,
  ...LIVE_FEATURES,
  ...REGISTRY_FEATURES,
];
