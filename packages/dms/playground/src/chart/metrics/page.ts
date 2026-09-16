import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartLine,
  ChartMixed,
  ChartRangeArea,
  ChartType,
  KpiCard,
  PeriodSelector,
} from "@antelopejs/interface-dms/base";
import { Color } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

const OPS_SCOPE = "ops-metrics";
const OPS_SYNC_GROUP = "ops-grid";
const REPLICA_MAX_BOUND = 4;
const REPLICA_Y_MAX = 6;
const SPEND_CAP = 700;
const PANEL_HEIGHT = "260px";

@RegisterPage()
export class PageChartMetrics extends PageController("chart-metrics", {
  displayName: "Ops Metrics",
  icon: "i-ph-pulse",
  category: pageCategory,
  order: 75,
  description:
    "Segmented period, latency bands, stepline replicas, reference lines and a synced crosshair",
}) {
  static period = PeriodSelector({
    id: OPS_SCOPE,
    variant: "segmented",
    align: "left",
    defaultPreset: "last-24h",
    presets: [
      "last-hour",
      "last-24h",
      "last-7-days",
      "last-30-days",
      "last-90-days",
      "custom",
    ],
    comparisons: ["none", "previous-period"],
  });

  static latencyKpi = KpiCard({
    title: "p95 latency",
    variant: "stat",
    icon: "i-ph-timer",
    fetchUrl: "/api/dashboard/kpi/latency",
    periodScope: OPS_SCOPE,
    invert: true,
    compareLabel: "vs previous period",
  });

  static latency = ChartRangeArea({
    title: "Latency — p50 / p95 / p99 bands",
    description: "Two stacked bands read as one distribution",
    fetchUrl: "/api/dashboard/latency",
    periodScope: OPS_SCOPE,
    color: [Color.primary, Color.info],
    syncGroup: OPS_SYNC_GROUP,
    height: PANEL_HEIGHT,
  });

  static latencyBandLine = ChartMixed({
    title: "Latency — band with median line",
    description: "A p50–p99 band carrying the p95 line on top",
    fetchUrl: "/api/dashboard/latency-band-line",
    periodScope: OPS_SCOPE,
    seriesDefs: [
      { name: "p50 – p99", type: ChartType.RANGE_AREA },
      { name: "p95", type: ChartType.LINE },
    ],
    color: [Color.info, Color.primary],
    height: PANEL_HEIGHT,
  });

  static replicas = ChartLine({
    title: "Replicas",
    description: "Stepline curve with a max-bound reference line",
    fetchUrl: "/api/dashboard/replicas",
    periodScope: OPS_SCOPE,
    curve: "stepline",
    color: Color.success,
    syncGroup: OPS_SYNC_GROUP,
    height: PANEL_HEIGHT,
    yRange: { min: 0, max: REPLICA_Y_MAX },
    annotations: [
      { y: REPLICA_MAX_BOUND, label: "max bound", color: Color.warning },
    ],
  });

  static cost = ChartArea({
    title: "Cost",
    description: "Spend cap drawn as a Y-axis annotation",
    fetchUrl: "/api/dashboard/series?seed=9&size=12",
    color: Color.primary,
    height: PANEL_HEIGHT,
    annotations: [{ y: SPEND_CAP, label: "spend cap", color: Color.error }],
  });
}
