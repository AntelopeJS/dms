import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartDonut,
  ChartPie,
  ChartRadialBar,
} from "@antelopejs/interface-dms/base";
import { pageCategory } from "../category";

@RegisterPage()
export class PageChartCircular extends PageController("chart-circular", {
  displayName: "Circular Charts",
  icon: "i-ph-chart-pie-slice",
  category: pageCategory,
  order: 20,
  description: "Donut, Pie and RadialBar charts",
}) {
  static donut = ChartDonut({
    title: "Donut chart",
    fetchUrl: "/api/dashboard/circular?size=5",
    centralLabel: "Channels",
    centralSubLabel: "Distribution",
  });

  static pie = ChartPie({
    title: "Pie chart",
    fetchUrl: "/api/dashboard/circular?size=4",
  });

  static radialBar = ChartRadialBar({
    title: "Radial bar chart",
    fetchUrl: "/api/dashboard/circular?size=4",
    showTotal: true,
  });
}
