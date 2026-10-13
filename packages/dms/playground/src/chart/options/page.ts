import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartDonut,
  ChartHeatmap,
  ChartLine,
  ChartMixed,
  ChartRadialBar,
  ChartRangeArea,
  ChartScatter,
  ChartType,
} from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { AxeOrientation } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

const SERIES_URL = "/api/dashboard/series";
const FIXED_WIDTH_PX = 420;
const AUTO_Y_PADDING = 0.1;

const PLAN_VS_ACTUAL = [
  {
    name: "Plan",
    data: [
      { x: "Jan", y: 300 },
      { x: "Feb", y: 340 },
      { x: "Mar", y: 380 },
      { x: "Apr", y: 420 },
      { x: "May", y: 460 },
    ],
    strokeWidth: 1,
    strokeDashArray: 6,
    color: "neutral" as const,
  },
  {
    name: "Actual",
    data: [
      { x: "Jan", y: 280 },
      { x: "Feb", y: 360 },
      { x: "Mar", y: 350 },
      { x: "Apr", y: 470 },
      { x: "May", y: 510 },
    ],
    strokeWidth: 4,
    color: "accent" as const,
  },
];

const DEALS = [
  {
    name: "Deals",
    data: [
      { x: 3, y: 120, label: "Acme" },
      { x: 7, y: 340, label: "Globex" },
      { x: 12, y: 210, label: "Initech" },
      { x: 18, y: 460, label: "Umbrella" },
      { x: 25, y: 380, label: "Stark" },
    ],
  },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const HOURS = ["08h", "10h", "12h", "14h", "16h", "18h"];
const LOAD_SEED = 7;
const LOAD_MAX = 100;

const LOAD_BY_HOUR = WEEKDAYS.map((day, dayIndex) => ({
  name: day,
  data: HOURS.map((hour, hourIndex) => ({
    x: hour,
    y: ((dayIndex + 1) * (hourIndex + LOAD_SEED) * LOAD_SEED) % LOAD_MAX,
  })),
}));

@RegisterPage()
export class PageChartOptions extends PageController("chart-options", {
  displayName: "Chart options",
  icon: "i-ph-faders",
  category: pageCategory,
  order: 45,
  description:
    "The chart options the other pages leave at their default: legend, tooltip, grid, axes, annotations, per-series strokes, stacking, colours and raw ApexCharts options. Click a slice or a point: the log card lists the click events.",
}) {
  static clicks = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "donut",
        ChartDonut({
          title: "Click a slice (SEGMENT_CLICK)",
          fetchUrl: "/api/dashboard/circular?size=4",
        }),
      )
      .child(
        "line",
        ChartLine({
          title: "Click a point (POINT_CLICK)",
          fetchUrl: `${SERIES_URL}?seed=29&size=8`,
        }),
      )
      .child(
        "log",
        CustomComponent("ChartClickLog").options({
          title: "Chart events",
          hint: "Click a slice of the donut or a point of the line.",
        }),
      ),
  );

  static legendAndGrid = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "bottomLegend",
        ChartLine({
          title: "Legend at the bottom, no grid, straight, 420 px wide",
          fetchUrl: `${SERIES_URL}?seed=30&size=12&count=2`,
          legendPosition: "bottom",
          showGrid: false,
          curve: "straight",
          width: FIXED_WIDTH_PX,
        }),
      )
      .child(
        "bare",
        ChartLine({
          title: "No tooltip, no legend",
          fetchUrl: `${SERIES_URL}?seed=31&size=12&count=2`,
          showTooltip: false,
          showLegend: false,
        }),
      ),
  );

  static annotations = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "band",
        ChartLine({
          title: "autoYRange + a band and a dashed line",
          fetchUrl: `${SERIES_URL}?seed=32&size=12`,
          autoYRange: { padding: AUTO_Y_PADDING },
          annotations: [
            { y: 200, y2: 400, label: "target band", color: "success-300" },
            { y: 700, label: "cap", color: "var(--ui-error)", dashed: true },
          ],
        }),
      )
      .child(
        "strokes",
        ChartLine({
          title: "Per-series stroke width and dash",
          staticDataset: PLAN_VS_ACTUAL,
        }),
      ),
  );

  static stacking = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "stackedArea",
        ChartArea({
          title: "Stacked area, shade tokens",
          fetchUrl: `${SERIES_URL}?seed=33&size=12&count=3`,
          stacked: true,
          color: ["primary-300", "primary-500", "primary-700"],
        }),
      )
      .child(
        "rangeOpacity",
        ChartRangeArea({
          title: "Range area, fillOpacity 0.15",
          fetchUrl: "/api/dashboard/latency",
          fillOpacity: 0.15,
        }),
      ),
  );

  static bars = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "horizontal",
        ChartBar({
          title: "Stacked horizontal bars, square corners",
          fetchUrl: `${SERIES_URL}?seed=34&size=6&count=2`,
          stacked: true,
          barWidth: 60,
          roundedCorners: false,
          orientation: AxeOrientation.horizontal,
        }),
      )
      .child(
        "vertical",
        ChartBar({
          title: "Vertical bars, an rgb() colour",
          fetchUrl: `${SERIES_URL}?seed=35&size=6`,
          orientation: AxeOrientation.vertical,
          roundedCorners: true,
          color: "rgb(14 165 233)",
        }),
      ),
  );

  static axes = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "scatter",
        ChartScatter({
          title: "Numeric axis, labelled points",
          staticDataset: DEALS,
          xaxisType: "numeric",
          showLabels: true,
          color: "secondary",
        }),
      )
      .child(
        "rotated",
        ChartColumn({
          title: "Category axis: 6 ticks, rotated -45°",
          fetchUrl: `${SERIES_URL}?seed=36&size=12`,
          xaxisType: "category",
          xAxis: { tickAmount: 6, rotate: -45, hideOverlappingLabels: true },
        }),
      )
      .child(
        "datetime",
        ChartArea({
          title: "Datetime axis formatted dd MMM",
          fetchUrl: "/api/dashboard/sales",
          xaxisType: "datetime",
          xAxis: { datetimeFormat: "dd MMM" },
        }),
      ),
  );

  static others = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "hollow",
        ChartRadialBar({
          title: "Radial bar, hollow 40%",
          fetchUrl: "/api/dashboard/circular?size=3",
          hollowSize: "40%",
        }),
      )
      .child(
        "heatmap",
        ChartHeatmap({
          title: "Static heatmap, distributed, an hsl() colour",
          staticDataset: LOAD_BY_HOUR,
          distributed: true,
          color: "hsl(262 83% 58%)",
        }),
      )
      .child(
        "mixed",
        ChartMixed({
          title: "seriesDefs with their own colour",
          fetchUrl: `${SERIES_URL}?seed=37&size=12&count=2`,
          seriesDefs: [
            { name: "Series 1", type: ChartType.COLUMN, color: "info" },
            { name: "Series 2", type: ChartType.LINE, color: "--ui-primary" },
          ],
        }),
      ),
  );

  static raw = ChartLine({
    title: "rawOptions (bigger markers) and rawCss (rounded frame)",
    fetchUrl: `${SERIES_URL}?seed=38&size=12`,
    rawOptions: [{ key: "markers.size", value: "5" }],
    rawCss: [{ key: "border-radius", value: "12px" }],
    color: "--ui-secondary",
  });
}
