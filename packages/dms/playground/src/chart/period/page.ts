import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import { KpiCard, PeriodSelector } from "@antelopejs/interface-dms/base";
import { CustomComponent } from "@antelopejs/interface-dms/base/custom";
import { pageCategory } from "../category";

const MODULE_SCOPE = "period-module-owned";

@RegisterPage()
export class PageChartPeriod extends PageController("chart-period", {
  displayName: "PeriodSelector Variants",
  icon: "i-ph-calendar",
  category: pageCategory,
  order: 70,
  description: "PeriodSelector variants (presets, comparisons, align)",
}) {
  static rightDefault = PeriodSelector({
    id: "period-right",
    align: "right",
    defaultPreset: "this-month",
    defaultComparison: "previous-period",
  });

  static rightDefaultKpi = KpiCard({
    title: "Live KPI bound to right selector",
    fetchUrl: "/api/dashboard/kpi/revenue",
    periodScope: "period-right",
    valueFormat: "currency",
  });

  static centerLimited = PeriodSelector({
    id: "period-center",
    align: "center",
    presets: ["last-7-days", "last-30-days", "this-month"],
    comparisons: ["none", "previous-period"],
    defaultPreset: "last-7-days",
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
    title: "Live KPI bound to the segmented selector",
    fetchUrl: "/api/dashboard/kpi/orders",
    periodScope: "period-segmented",
  });

  static moduleOwnedPicker = CustomComponent("BillingMonthPicker").options({
    scopeId: MODULE_SCOPE,
    title: "Billing month",
    compareLabel: "Compare to previous month",
  });

  static moduleOwnedKpi = KpiCard({
    title: "KPI bound to a module-owned period scope",
    description: "No PeriodSelector on this scope — the component registers it",
    fetchUrl: "/api/dashboard/kpi/revenue",
    periodScope: MODULE_SCOPE,
    valueFormat: "currency",
    compareLabel: "vs previous month",
  });

  static leftCustomLabels = PeriodSelector({
    id: "period-left",
    align: "left",
    presetLabels: {
      "this-month": "Current month",
      "last-month": "Previous month",
    },
    comparisonLabels: {
      "previous-year": "Same period, last year",
    },
  });
}
