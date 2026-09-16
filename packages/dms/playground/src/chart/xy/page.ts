import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartScatter,
} from "@antelopejs/interface-dms/base";
import { Color } from "@antelopejs/interface-dms/base/types";
import { pageCategory } from "../category";

@RegisterPage()
export class PageChartXY extends PageController("chart-xy", {
  displayName: "XY Charts",
  icon: "i-ph-chart-line",
  category: pageCategory,
  order: 10,
  description: "Line, Area, Bar, Column and Scatter charts",
}) {
  static line = ChartLine({
    title: "Line chart",
    fetchUrl: "/api/dashboard/series?seed=1&size=12",
    color: Color.primary,
  });

  static area = ChartArea({
    title: "Area chart",
    fetchUrl: "/api/dashboard/series?seed=2&size=12",
    color: Color.info,
  });

  static bar = ChartBar({
    title: "Bar chart (horizontal)",
    fetchUrl: "/api/dashboard/series?seed=3&size=6",
    color: Color.success,
  });

  static column = ChartColumn({
    title: "Column chart",
    fetchUrl: "/api/dashboard/series?seed=4&size=6",
    color: Color.warning,
  });

  static scatter = ChartScatter({
    title: "Scatter plot",
    fetchUrl: "/api/dashboard/series?seed=5&size=12",
    color: Color.error,
    pointSize: 8,
  });

  static stackedColumn = ChartColumn({
    title: "Stacked columns + multi-color",
    description: "Multiple series with explicit color array",
    fetchUrl: "/api/dashboard/series?seed=20&size=6&count=3",
    stacked: true,
    color: ["primary", "info", "warning"],
    columnWidth: 40,
    roundedCorners: true,
  });

  static boundedLine = ChartLine({
    title: "Constrained yRange",
    description: "yRange clamps the axis so small variations look bigger",
    fetchUrl: "/api/dashboard/series?seed=21&size=12",
    yRange: { min: 0, max: 1000 },
    smooth: false,
    strokeWidth: 4,
    color: Color.success,
  });
}
