import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  Banner,
  DEFAULT_PERIOD_SCOPE,
  KpiCard,
  PeriodSelector,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { pageCategory } from "../category";

const MODULE_SCOPE = "period-module-owned";
/** Shared with the Ops Metrics page: the last choice follows between them. */
export const PLAYGROUND_OPS_PERIOD_KEY = "playground-ops";
const CUSTOM_RANGE_MAX_DAYS = 31;
const REVENUE_URL = "/api/dashboard/kpi/revenue";
const ORDERS_URL = "/api/dashboard/kpi/orders";
const INCIDENT_LINK =
  "/charts/chart-period?period-right.from=2026-10-01&period-right.to=2026-10-03";

@RegisterPage()
export class PageChartPeriod extends PageController("chart-period", {
  displayName: "PeriodSelector Variants",
  icon: "i-ph-calendar",
  category: pageCategory,
  order: 70,
  description:
    "Every PeriodSelector option, each selector driving the KPI under it: presets and calendar periods, comparison controls, sizes, relabelled presets, a remembered choice, a 31-day custom range limit and the default page scope. Change a selector and watch its KPI reload.",
}) {
  static urlSync = Banner({
    tone: "info",
    size: "sm",
    title: "The period lives in the URL",
    description:
      "Each selector writes ?<id>.period= (and .from / .to for a custom range), so a link opens on the same window.",
    actions: [{ label: "Open on an incident window", to: INCIDENT_LINK }],
  });

  static rightDefault = PeriodSelector({
    id: "period-right",
    align: "right",
    defaultPreset: "this-month",
    defaultComparison: "previous-period",
  });

  static rightDefaultKpi = KpiCard({
    title: "Bound to the right selector (every preset)",
    fetchUrl: REVENUE_URL,
    periodScope: "period-right",
    valueFormat: "currency",
  });

  static calendar = PeriodSelector({
    id: "period-calendar",
    presets: [
      "today",
      "yesterday",
      "this-month",
      "last-month",
      "this-quarter",
      "last-quarter",
      "ytd",
      "last-year",
      "custom",
    ],
    comparisons: ["none", "previous-period", "previous-year", "custom"],
    defaultPreset: "today",
    showRangeLabel: true,
    comparisonControl: "menu",
    maxDays: CUSTOM_RANGE_MAX_DAYS,
    size: "md",
  });

  static calendarKpi = KpiCard({
    title: "Calendar presets, comparison menu, custom range of 31 days at most",
    fetchUrl: ORDERS_URL,
    periodScope: "period-calendar",
  });

  static centerLimited = PeriodSelector({
    id: "period-center",
    align: "center",
    size: "sm",
    presets: ["last-7-days", "last-30-days", "this-month"],
    comparisons: ["none", "previous-period"],
    comparisonControl: "toggle",
    defaultPreset: "last-7-days",
  });

  static centerKpi = KpiCard({
    title: "Three presets, a comparison toggle",
    fetchUrl: REVENUE_URL,
    periodScope: "period-center",
    valueFormat: "currency",
  });

  static hiddenCompare = PeriodSelector({
    id: "period-hidden",
    size: "lg",
    presets: ["last-7-days", "last-30-days"],
    comparisons: ["none", "previous-year"],
    comparisonControl: "hidden",
  });

  static hiddenCompareKpi = KpiCard({
    title: "Comparison hidden but on: always vs previous year",
    fetchUrl: ORDERS_URL,
    periodScope: "period-hidden",
  });

  static segmentedIntraday = PeriodSelector({
    id: "period-segmented",
    variant: "segmented",
    align: "left",
    size: "xs",
    presets: ["last-hour", "last-24h", "last-7-days", "last-30-days", "custom"],
    comparisons: ["none", "previous-period"],
    defaultPreset: "last-24h",
  });

  static segmentedKpi = KpiCard({
    title: "Bound to the segmented selector",
    fetchUrl: ORDERS_URL,
    periodScope: "period-segmented",
  });

  static segmentedOps = PeriodSelector({
    id: "period-ops",
    variant: "segmented",
    align: "left",
    size: "xl",
    presets: ["last-hour", "last-24h", "last-7-days", "all"],
    comparisons: ["previous-period"],
    defaultPreset: "last-24h",
    rangeLabel: "relative",
    rememberKey: PLAYGROUND_OPS_PERIOD_KEY,
  });

  static opsKpi = KpiCard({
    title: "All time sends no from / to; remembered with Ops Metrics",
    fetchUrl: ORDERS_URL,
    periodScope: "period-ops",
  });

  static moduleOwnedPicker = CustomComponent("BillingMonthPicker").options({
    scopeId: MODULE_SCOPE,
    title: "Billing month",
    compareLabel: "Compare to previous month",
  });

  static moduleOwnedKpi = KpiCard({
    title: "KPI bound to a module-owned period scope",
    description: "No PeriodSelector on this scope: the component registers it",
    fetchUrl: REVENUE_URL,
    periodScope: MODULE_SCOPE,
    valueFormat: "currency",
    compareLabel: "vs previous month",
  });

  static leftCustomLabels = PeriodSelector({
    id: "period-left",
    align: "left",
    presets: ["this-month", "last-month", "this-quarter"],
    comparisons: ["none", "previous-year"],
    presetLabels: {
      "this-month": "Current month",
      "last-month": "Previous month",
    },
    comparisonLabels: {
      "previous-year": "Same period, last year",
    },
  });

  static leftKpi = KpiCard({
    title: "Relabelled presets and comparison",
    fetchUrl: REVENUE_URL,
    periodScope: "period-left",
    valueFormat: "currency",
  });

  static pageScope = PeriodSelector({
    presets: ["last-7-days", "last-30-days"],
    defaultPreset: "last-7-days",
    comparisons: ["none"],
  });

  static pageScopeKpi = KpiCard({
    title: `periodScope: "${DEFAULT_PERIOD_SCOPE}" (a selector without id)`,
    fetchUrl: REVENUE_URL,
    periodScope: DEFAULT_PERIOD_SCOPE,
    valueFormat: "currency",
  });
}
