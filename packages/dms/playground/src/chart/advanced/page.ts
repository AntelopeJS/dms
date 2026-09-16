import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartCandlestick,
  ChartHeatmap,
  ChartMixed,
  ChartRadar,
  ChartType,
} from "@antelopejs/interface-dms/base";
import { Color } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageChartAdvanced extends PageController("chart-advanced", {
  displayName: "Advanced Charts",
  icon: "i-ph-chart-line-up",
  category: pageCategory,
  order: 40,
  description: "Mixed, Radar, Heatmap and Candlestick charts",
}) {
  static mixed = ChartMixed({
    title: "Mixed chart",
    fetchUrl: "/api/dashboard/series?seed=10&size=12&count=2",
    color: [Color.info, Color.warning],
    seriesDefs: [
      { name: "Series 1", type: ChartType.COLUMN },
      { name: "Series 2", type: ChartType.LINE },
    ],
  });

  static radar = ChartRadar({
    title: "Radar chart",
    fetchUrl: "/api/dashboard/series?seed=11&size=6",
    color: Color.success,
    fillOpacity: 0.2,
  });

  static heatmap = ChartHeatmap({
    title: "Heatmap",
    fetchUrl: "/api/dashboard/series?seed=12&size=12&count=5",
    color: ["#0ea5e9", "#22c55e", "#eab308", "#f97316", "#ef4444"],
    shadeIntensity: 0.5,
  });

  static candlestick = ChartCandlestick({
    title: "Candlestick chart",
    fetchUrl: "/api/dashboard/candlestick",
  });
}
