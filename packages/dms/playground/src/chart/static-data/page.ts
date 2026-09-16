import { PageController, RegisterPage } from "@antelopejs/interface-dms/page";
import {
  ChartArea,
  ChartCandlestick,
  ChartColumn,
  ChartDonut,
  ChartLine,
} from "@antelopejs/interface-dms/base";
import { pageCategory } from "../category";

const QUARTERLY_REVENUE = [
  { x: "Q1", y: 12000 },
  { x: "Q2", y: 18500 },
  { x: "Q3", y: 14200 },
  { x: "Q4", y: 22100 },
];

const QUARTERLY_REVENUE_PREVIOUS = [
  { x: "Q1", y: 9800 },
  { x: "Q2", y: 16100 },
  { x: "Q3", y: 13500 },
  { x: "Q4", y: 19400 },
];

const TRAFFIC_BREAKDOWN = [
  { label: "Direct", value: 4200 },
  { label: "Email", value: 1800 },
  { label: "Search", value: 6500 },
  { label: "Social", value: 2100 },
];

const PRICE_HISTORY: Array<{ x: string; y: [number, number, number, number] }> =
  [
    { x: "Mon", y: [110, 118, 105, 115] },
    { x: "Tue", y: [115, 120, 112, 118] },
    { x: "Wed", y: [118, 119, 108, 110] },
    { x: "Thu", y: [110, 116, 109, 114] },
    { x: "Fri", y: [114, 124, 113, 122] },
  ];

@RegisterPage()
export class PageChartStaticData extends PageController("chart-static", {
  displayName: "Static Datasets",
  icon: "i-ph-database",
  category: pageCategory,
  order: 80,
  description:
    "Charts running purely off staticDataset, with no fetchUrl and no periodScope",
}) {
  static line = ChartLine({
    title: "Quarterly revenue",
    description: "Inline staticDataset with comparison series",
    staticDataset: [
      { name: "2026", data: QUARTERLY_REVENUE, color: "#7c3aed" },
      {
        name: "2025",
        data: QUARTERLY_REVENUE_PREVIOUS,
        color: "#94a3b8",
      },
    ],
    comparisonStyle: "dashed",
  });

  static area = ChartArea({
    title: "Filled area with custom opacity",
    staticDataset: [{ name: "2026", data: QUARTERLY_REVENUE }],
    color: "warning",
    fillOpacity: 0.7,
  });

  static column = ChartColumn({
    title: "Bounded yRange",
    description: "Same data with yRange forcing 0–25000 axis",
    staticDataset: [{ name: "Revenue", data: QUARTERLY_REVENUE }],
    yRange: { min: 0, max: 25000 },
    columnWidth: 30,
    roundedCorners: true,
    color: "info",
  });

  static donut = ChartDonut({
    title: "Static donut",
    description: "Donut with central label and 30% arc",
    staticDataset: TRAFFIC_BREAKDOWN,
    centralLabel: "Total",
    centralSubLabel: "Sessions",
    arcWidth: 30,
  });

  static candlestick = ChartCandlestick({
    title: "OHLC sample",
    description: "Static candlestick from inline OHLC tuples",
    staticDataset: [{ name: "Price", data: PRICE_HISTORY }],
  });
}
