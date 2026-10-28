import type { PlaygroundFeature } from "./types";
import {
  feature,
  FEEDBACK,
  STAT_GROUP,
  KEY_VALUE,
  ACTIVITY,
  RECORD,
  SETTINGS,
  TABS_BASIC,
  METERS,
  GUARD,
  NAV_CARDS,
  LIVE,
  TABS_COUNTS,
  CHART_REALTIME,
  CHART_CARDS,
  CHART_TOP_LIST,
  PAGE_TOOLBAR,
  PAGE_TOOLBAR_REPORT,
  CATALOG,
} from "./blocks-data";

export const PLUMBING: PlaygroundFeature[] = [
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

export const PERIOD_AND_REALTIME: PlaygroundFeature[] = [
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

export const COMPOSED_TEXTS: PlaygroundFeature[] = [
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

export const LIVE_FEATURES: PlaygroundFeature[] = [
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
    "Page context bar: scope, live and period",
    "pageToolbar({ leading, live, period })",
    PAGE_TOOLBAR,
    "0.9.6",
  ),
  feature(
    "Toolbar size for the toggle and the period",
    'PageToolbar({ size: "xs" }), LiveToggle({ size })',
    PAGE_TOOLBAR,
    "0.9.6",
  ),
  feature(
    "Last update and refresh without live",
    "pageToolbar({ live: false, showUpdatedAt, refresh })",
    PAGE_TOOLBAR_REPORT,
    "0.9.6",
  ),
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

export const REGISTRY_FEATURES: PlaygroundFeature[] = [
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
