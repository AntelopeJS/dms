import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartCard,
  ChartLine,
  KpiCard,
  PeriodSelector,
} from "@antelopejs/interface-dms/base";
import { Grid, GridRow } from "@antelopejs/interface-dms/base/grid";
import { pageCategory } from "../category";

const SCOPE_ID = "demo-cards";

@RegisterPage()
export class PageChartCardKpi extends PageController("chart-card-kpi", {
  displayName: "ChartCard & KpiCard Variants",
  icon: "i-ph-cards",
  category: pageCategory,
  order: 50,
  description: "Variants of ChartCard and KpiCard with and without scope",
}) {
  static periodSelector = PeriodSelector({
    id: SCOPE_ID,
    defaultPreset: "this-month",
    defaultComparison: "previous-period",
    align: "right",
  });

  static cardWithComparison = ChartCard({
    title: "Sales (with scope)",
    description: "ChartCard with scope-aware fetch",
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

  static kpisCompact = Grid({ gap: "1rem" }).child(
    "kpiRow",
    GridRow()
      .child(
        "k1",
        KpiCard({
          title: "Ventes globales",
          icon: "i-lucide-euro",
          valueFormat: "currency",
          staticValue: 238052,
          staticDelta: -6.4,
          compareLabel: "vs période comparée",
        }),
      )
      .child(
        "k2",
        KpiCard({
          title: "Nouveaux clients",
          icon: "i-lucide-user-plus",
          valueFormat: "compact",
          staticValue: 1247,
          staticDelta: 12.3,
          compareLabel: "vs période comparée",
        }),
      )
      .child(
        "k3",
        KpiCard({
          title: "Erreurs (invert)",
          icon: "i-lucide-alert-triangle",
          valueFormat: "compact",
          invert: true,
          staticValue: 142,
          staticDelta: -22,
          compareLabel: "vs période comparée",
        }),
      ),
  );

  static kpisWithSparkline = Grid({ gap: "1rem" }).child(
    "kpiSparkRow",
    GridRow()
      .child(
        "s1",
        KpiCard({
          title: "Magasin DROGENBOS",
          icon: "i-lucide-store",
          valueFormat: "currency",
          staticValue: 17637,
          staticDelta: 8.1,
          compareLabel: "vs 16.316 €",
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
          title: "Trafic en baisse",
          icon: "i-lucide-eye",
          valueFormat: "compact",
          staticValue: 8420,
          staticDelta: -14.2,
          compareLabel: "vs 9.812",
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
          compareLabel: "vs période comparée",
          showSparkline: true,
        }),
      ),
  );
}
