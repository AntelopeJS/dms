import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartCard,
  KpiCard,
  PeriodSelector,
} from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { pageCategory } from "../category";

const SALES_SCOPE = "sales-scope";
const TRAFFIC_SCOPE = "traffic-scope";

@RegisterPage()
export class PageChartMultiScope extends PageController("chart-multi-scope", {
  displayName: "Multiple Scopes",
  icon: "i-ph-chart-line-up",
  category: pageCategory,
  order: 90,
  description:
    "Two independent PeriodSelectors driving disjoint groups of charts on the same page",
}) {
  static salesPeriod = PeriodSelector({
    id: SALES_SCOPE,
    align: "left",
    defaultPreset: "this-month",
    defaultComparison: "previous-period",
  });

  static salesGroup = Grid({ gap: "1rem" }).child(
    "row",
    GridRow()
      .child(
        "salesKpi",
        KpiCard({
          title: "Sales revenue",
          icon: "i-lucide-euro",
          fetchUrl: "/api/dashboard/kpi/revenue",
          periodScope: SALES_SCOPE,
          valueFormat: "currency",
          compareLabel: "vs période comparée",
          showSparkline: true,
        }),
      )
      .child(
        "salesChart",
        ChartCard({
          title: "Sales over time",
          fetchUrl: "/api/dashboard/sales",
          periodScope: SALES_SCOPE,
          valueFormat: "currency",
          chart: ChartArea({
            comparisonStyle: "dimmed",
            xaxisType: "datetime",
          }),
        }),
      ),
  );

  static trafficPeriod = PeriodSelector({
    id: TRAFFIC_SCOPE,
    align: "left",
    defaultPreset: "last-7-days",
    defaultComparison: "previous-period",
    presets: ["last-7-days", "last-30-days", "this-month", "last-month"],
  });

  static trafficGroup = Grid({ gap: "1rem" }).child(
    "row",
    GridRow()
      .child(
        "trafficKpi",
        KpiCard({
          title: "Customers",
          icon: "i-lucide-users",
          fetchUrl: "/api/dashboard/kpi/customers",
          periodScope: TRAFFIC_SCOPE,
          valueFormat: "compact",
          compareLabel: "vs période comparée",
          showSparkline: true,
        }),
      )
      .child(
        "trafficChart",
        ChartCard({
          title: "Traffic vs comparison",
          fetchUrl: "/api/dashboard/sales",
          periodScope: TRAFFIC_SCOPE,
          valueFormat: "compact",
          chart: ChartArea({ comparisonStyle: "solid", xaxisType: "datetime" }),
        }),
      ),
  );
}
