import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartCard,
  ChartColumn,
  ChartDonut,
  ChartLine,
  KpiCard,
  PeriodSelector,
} from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { DefaultLayout } from "@antelopejs/interface-dms/base/layouts";
import { HttpMethod } from "@antelopejs/interface-dms/base/types";
import { REALTIME_DEMO_TOPIC } from "../api/realtime";
import { pageCategory } from "../category";

const SCOPE_ID = "demo-cards";
const COMPARE_LABEL = "vs compared period";

@RegisterPage()
export class PageChartCardKpi extends PageController(
  "chart-card-kpi",
  {
    displayName: "ChartCard & KpiCard Variants",
    icon: "i-ph-cards",
    category: pageCategory,
    order: 50,
    description:
      'ChartCard (with and without a period, a nested donut, two-series legend, currency and labels, live refresh) and KpiCard (formats, precision, sparklines, no delta, a period that measured nothing). Press "Append a point" to refresh the live card.',
  },
  DefaultLayout({
    headerActions: [
      {
        id: "bump",
        label: "Append a point",
        icon: "i-ph-plus",
        target: {
          type: "api",
          method: "POST",
          url: "/api/dashboard/realtime/bump",
          successMessage: "Point appended",
        },
      },
    ],
  }),
) {
  static periodSelector = PeriodSelector({
    id: SCOPE_ID,
    presets: ["this-month", "last-month", "this-quarter"],
    defaultPreset: "this-month",
    defaultComparison: "previous-period",
    align: "right",
  });

  static cardWithComparison = ChartCard({
    title: "Sales (with scope)",
    description: "ChartCard reading the selector's period and comparison",
    fetchUrl: "/api/dashboard/sales",
    periodScope: SCOPE_ID,
    valueFormat: "currency",
    chart: ChartArea({ comparisonStyle: "dashed", xaxisType: "datetime" }),
  });

  static cardStandalone = ChartCard({
    title: "Sales (standalone)",
    description: "ChartCard without periodScope",
    fetchUrl: "/api/dashboard/sales",
    valueFormat: "currency",
    chart: ChartLine({ smooth: true, xaxisType: "datetime" }),
  });

  static chartCards = Grid({ gap: "1rem", minColumnWidth: "320px" }).child(
    "row",
    GridRow()
      .child(
        "channels",
        ChartCard({
          title: "Channels",
          description: "A donut nested in the card, no delta",
          icon: "i-ph-chart-donut",
          fetchUrl: "/api/dashboard/cards/channels",
          periodScope: SCOPE_ID,
          valueFormat: "number",
          showDelta: false,
          chart: ChartDonut({ centralLabel: "Sessions", arcWidth: 30 }),
        }),
      )
      .child(
        "latency",
        ChartCard({
          title: "Latency (ms)",
          description: "Series legend under the figure, chart legend off",
          icon: "i-ph-timer",
          fetchUrl: "/api/dashboard/cards/latency",
          fetchUrlMethod: HttpMethod.get,
          periodScope: SCOPE_ID,
          valueFormat: "number",
          valuePrecision: 1,
          showSeriesLegend: true,
          chart: ChartLine({ legendPosition: "bottom" }),
        }),
      )
      .child(
        "revenue",
        ChartCard({
          title: "Revenue (USD)",
          description: "Currency, labelled primary and comparison legend",
          fetchUrl: "/api/dashboard/sales",
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          currencyCode: "USD",
          valuePrecision: 0,
          primaryLabel: "$demo.blocks.chart_card.this_period",
          comparisonLabel: "$demo.blocks.chart_card.last_period",
          chart: ChartColumn({ roundedCorners: true }),
        }),
      ),
  );

  // Read again on each point appended by the header button, over realtime.
  static liveCard = ChartCard({
    title: "Live counter",
    description: "realtimeTopic: the figure is the last point",
    fetchUrl: "/api/dashboard/realtime/card",
    realtimeTopic: REALTIME_DEMO_TOPIC,
    valueFormat: "number",
    showDelta: false,
    showLegend: false,
    chart: ChartArea({ smooth: true }),
  });

  static kpisCompact = Grid({ gap: "1rem" }).child(
    "kpiRow",
    GridRow()
      .child(
        "k1",
        KpiCard({
          title: "Overall sales",
          icon: "i-lucide-euro",
          valueFormat: "currency",
          staticValue: 238052,
          staticDelta: -6.4,
          compareLabel: COMPARE_LABEL,
        }),
      )
      .child(
        "k2",
        KpiCard({
          title: "New customers",
          icon: "i-lucide-user-plus",
          valueFormat: "compact",
          staticValue: 1247,
          staticDelta: 12.3,
          compareLabel: COMPARE_LABEL,
        }),
      )
      .child(
        "k3",
        KpiCard({
          title: "Errors (invert)",
          icon: "i-lucide-alert-triangle",
          valueFormat: "compact",
          invert: true,
          staticValue: 142,
          staticDelta: -22,
          compareLabel: COMPARE_LABEL,
        }),
      ),
  );

  static kpiFormats = Grid({ gap: "1rem" }).child(
    "formatsRow",
    GridRow()
      .child(
        "conversion",
        KpiCard({
          title: "Conversion",
          description: "percent, 1 decimal, success sparkline",
          valueFormat: "percent",
          valuePrecision: 1,
          staticValue: 3.42,
          staticDelta: 0.4,
          showSparkline: true,
          sparklineAccent: "success",
          staticSparkline: [2.9, 3.1, 3, 3.2, 3.3, 3.42],
        }),
      )
      .child(
        "orders",
        KpiCard({
          title: "Orders",
          description: "number, showDelta false",
          valueFormat: "number",
          staticValue: 1284,
          staticDelta: 4,
          showDelta: false,
        }),
      )
      .child(
        "revenueUsd",
        KpiCard({
          title: "Revenue (USD)",
          description: "currency USD, native precision, accent auto",
          fetchUrl: "/api/dashboard/kpi/revenue",
          fetchUrlMethod: HttpMethod.get,
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          currencyCode: "USD",
          valuePrecision: "native",
          showSparkline: true,
          sparklineAccent: "auto",
          compareLabel: COMPARE_LABEL,
        }),
      )
      .child(
        "signups",
        KpiCard({
          title: "Sign-ups",
          description:
            "kpiCardData: the previous period measured nothing, no delta",
          fetchUrl: "/api/dashboard/cards/signups",
          periodScope: SCOPE_ID,
          valueFormat: "number",
          showSparkline: true,
          compareLabel: COMPARE_LABEL,
        }),
      ),
  );

  static kpisWithSparkline = Grid({ gap: "1rem" }).child(
    "kpiSparkRow",
    GridRow()
      .child(
        "s1",
        KpiCard({
          title: "Drogenbos store",
          icon: "i-lucide-store",
          valueFormat: "currency",
          staticValue: 17637,
          staticDelta: 8.1,
          compareLabel: "vs €16,316",
          showSparkline: true,
          staticSparkline: [
            14000, 14500, 15200, 14800, 15600, 16100, 15900, 16400, 16800,
            17100, 17400, 17637,
          ],
        }),
      )
      .child(
        "s2",
        KpiCard({
          title: "Falling traffic",
          icon: "i-lucide-eye",
          valueFormat: "compact",
          staticValue: 8420,
          staticDelta: -14.2,
          compareLabel: "vs 9,812",
          showSparkline: true,
          staticSparkline: [
            10500, 10200, 9900, 9600, 9400, 9200, 9000, 8900, 8800, 8700, 8500,
            8420,
          ],
        }),
      )
      .child(
        "s3",
        KpiCard({
          title: "Live revenue",
          icon: "i-lucide-activity",
          fetchUrl: "/api/dashboard/kpi/revenue",
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          compareLabel: COMPARE_LABEL,
          showSparkline: true,
        }),
      ),
  );
}
