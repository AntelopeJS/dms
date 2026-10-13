import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartCard,
  KpiCard,
  PeriodSelector,
  TopListCard,
} from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { pageCategory } from "../category";

const SCOPE_ID = "main";

@RegisterPage()
export class PageDashboardShowcase extends PageController("chart-dashboard", {
  displayName: "Dashboard Showcase",
  icon: "i-ph-chart-line",
  category: pageCategory,
  order: 0,
  description:
    "A dashboard: one PeriodSelector driving three KpiCards, a ChartCard compared with last year and two TopListCards. Change the period or the comparison to see every card reload.",
}) {
  static periodSelector = PeriodSelector({
    id: SCOPE_ID,
    defaultPreset: "this-month",
    defaultComparison: "previous-year",
    align: "right",
  });

  static kpis = Grid({ gap: "1rem" }).child(
    "row",
    GridRow()
      .child(
        "revenue",
        KpiCard({
          title: "Overall sales",
          icon: "i-lucide-euro",
          fetchUrl: "/api/dashboard/kpi/revenue",
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          compareLabel: "vs compared period",
          showSparkline: true,
        }),
      )
      .child(
        "orders",
        KpiCard({
          title: "Orders",
          icon: "i-lucide-shopping-bag",
          fetchUrl: "/api/dashboard/kpi/orders",
          periodScope: SCOPE_ID,
          valueFormat: "compact",
          compareLabel: "vs compared period",
          showSparkline: true,
        }),
      )
      .child(
        "customers",
        KpiCard({
          title: "New customers",
          icon: "i-lucide-user-plus",
          fetchUrl: "/api/dashboard/kpi/customers",
          periodScope: SCOPE_ID,
          valueFormat: "compact",
          compareLabel: "vs compared period",
          showSparkline: true,
        }),
      ),
  );

  static sales = ChartCard({
    title: "Overall sales",
    fetchUrl: "/api/dashboard/sales",
    periodScope: SCOPE_ID,
    valueFormat: "currency",
    chart: ChartArea({
      smooth: true,
      height: "320px",
      comparisonStyle: "dashed",
      xaxisType: "datetime",
    }),
  });

  static topLists = Grid({ gap: "1rem" }).child(
    "topListsRow",
    GridRow()
      .child(
        "trending",
        TopListCard({
          title: "Top 10 trending products",
          description: "Change vs the compared period",
          fetchUrl: "/api/dashboard/top-products?limit=10&withSparkline=true",
          periodScope: SCOPE_ID,
          valueFormat: "compact",
          showSparkline: true,
          showDelta: true,
          highlightTopN: 3,
          rankColor: "primary",
          badgeColor: "primary",
        }),
      )
      .child(
        "yoy",
        TopListCard({
          title: "Top 25 products",
          description: "Change vs the compared period",
          fetchUrl: "/api/dashboard/top-products?limit=25",
          periodScope: SCOPE_ID,
          valueFormat: "currency",
          showSparkline: false,
          showDelta: true,
          highlightTopN: 3,
          rankColor: "info",
          badgeColor: "info",
        }),
      ),
  );
}
