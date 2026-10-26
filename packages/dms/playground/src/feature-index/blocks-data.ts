import { FEATURE_AREAS, type PlaygroundFeature } from "./types";

const AREA = FEATURE_AREAS.blocks;

export const STAT_GROUP = "/blocks/blocks-stat-group";
export const KEY_VALUE = "/blocks/blocks-key-value";
export const NAV_CARDS = "/blocks/blocks-nav-cards";
export const FEEDBACK = "/blocks/blocks-feedback";
export const ACTIVITY = "/blocks/blocks-activity";
export const METERS = "/blocks/blocks-meters";
export const SETTINGS = "/blocks/blocks-settings";
export const CODE = "/blocks/blocks-code";
export const GUARD = "/blocks/blocks-guard";
export const LIVE = "/blocks/blocks-live";
export const PAGE_TOOLBAR = "/blocks/blocks-page-toolbar";
export const PAGE_TOOLBAR_REPORT = "/blocks/blocks-page-toolbar-report";
export const RECORD = "/blocks/blocks-record";
export const CATALOG = "/blocks/blocks-catalog";
export const CHART_DASHBOARD = "/charts/chart-dashboard";
export const CHART_XY = "/charts/chart-xy";
export const CHART_CIRCULAR = "/charts/chart-circular";
export const CHART_REALTIME = "/charts/chart-realtime";
export const CHART_ADVANCED = "/charts/chart-advanced";
export const CHART_OPTIONS = "/charts/chart-options";
export const CHART_CARDS = "/charts/chart-card-kpi";
export const CHART_TOP_LIST = "/charts/chart-top-list";
export const CHART_PERIOD = "/charts/chart-period";
export const CHART_METRICS = "/charts/chart-metrics";
export const CHART_STATIC = "/charts/chart-static";
export const CHART_SCOPES = "/charts/chart-multi-scope";
export const GRID_SIMPLE = "/grid/layout-grid-simple";
export const GRID_STACKED = "/grid/layout-grid-stacked";
export const GRID_HYBRID = "/grid/layout-grid-hybrid";
export const GRID_SPACER = "/grid/grid-spacer";
export const GRID_DENSE = "/grid/grid-dense";
export const HSTACK = "/stack/stack-hstack";
export const VSTACK = "/stack/stack-vstack";
export const SPACER = "/stack/stack-spacer";
export const STACK_COMBINED = "/stack/stack-combined";
export const TABS_BASIC = "/tabs/tabs-basic";
export const TABS_COUNTS = "/tabs/tabs-counts";
export const TABS_KEEP_ALIVE = "/tabs/tabs-keep-alive";
export const TABS_PERSIST = "/tabs/tabs-persist";
export const TABS_VARIANTS = "/tabs/tabs-variants";
export const MULTI_COMPONENT = "/multi-component/multi-component";

export function feature(
  name: string,
  api: string,
  demo: string,
  since?: string,
): PlaygroundFeature {
  return { area: AREA, feature: name, api, demo, since };
}
