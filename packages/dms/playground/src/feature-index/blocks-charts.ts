import type { PlaygroundFeature } from "./types";
import {
  feature,
  CHART_XY,
  CHART_CIRCULAR,
  CHART_ADVANCED,
  CHART_METRICS,
  CHART_STATIC,
  CHART_OPTIONS,
  CHART_REALTIME,
  CHART_SCOPES,
  CHART_CARDS,
  CHART_DASHBOARD,
  CHART_TOP_LIST,
  CHART_PERIOD,
  KEY_VALUE,
} from "./blocks-data";

export const CHART_TYPE_FEATURES: PlaygroundFeature[] = [
  feature(
    "Line, area, bar, column and scatter charts",
    "ChartLine, ChartArea, ChartBar, ChartColumn, ChartScatter",
    CHART_XY,
  ),
  feature(
    "Donut, pie and radial bar charts",
    "ChartDonut, ChartPie, ChartRadialBar",
    CHART_CIRCULAR,
  ),
  feature(
    "Mixed, radar, heatmap and candlestick charts",
    "ChartMixed, ChartRadar, ChartHeatmap, ChartCandlestick",
    CHART_ADVANCED,
  ),
  feature("Range area bands", "ChartRangeArea", CHART_METRICS),
  feature(
    "Mixed series types, a range area among them",
    "ChartMixed({ seriesDefs: [{ type: ChartType.RANGE_AREA }] })",
    CHART_METRICS,
  ),
  feature("Charts drawn from inline data", "staticDataset", CHART_STATIC),
  feature("Static heatmap", "ChartHeatmap({ staticDataset })", CHART_OPTIONS),
  feature("Chart read with a request method", "fetchUrlMethod", CHART_REALTIME),
  feature("Chart following a period selector", "periodScope", CHART_METRICS),
];

export const CHART_OPTION_FEATURES: PlaygroundFeature[] = [
  feature("Colours: names, arrays, hex", "color", CHART_XY),
  feature(
    "Colours: shade tokens, CSS variables and rgb()",
    'color: "primary-300" | "--ui-primary" | "rgb(...)"',
    CHART_OPTIONS,
  ),
  feature("Fixed chart width", "width", CHART_OPTIONS),
  feature(
    "Tooltip, legend and grid toggles",
    "showTooltip, showLegend, showGrid",
    CHART_OPTIONS,
  ),
  feature(
    "Legend under the chart",
    'legendPosition: "bottom"',
    CHART_OPTIONS,
    "0.7.12",
  ),
  feature(
    "Fixed and automatic Y range",
    "yRange, autoYRange: { padding }",
    CHART_OPTIONS,
  ),
  feature(
    "Comparison series styles",
    "comparisonStyle: dashed | solid | dimmed",
    CHART_SCOPES,
  ),
  feature(
    "Smooth, straight and stepline curves",
    "smooth, curve",
    CHART_METRICS,
  ),
  feature(
    "Reference lines, bands and dashed lines",
    "annotations: [{ y, y2, label, color, dashed }]",
    CHART_OPTIONS,
  ),
  feature("Crosshair synced between charts", "syncGroup", CHART_METRICS),
  feature("Datetime, category and numeric X axes", "xaxisType", CHART_OPTIONS),
  feature(
    "X axis ticks, rotation and date format",
    "xAxis: { tickAmount, rotate, hideOverlappingLabels, datetimeFormat }",
    CHART_OPTIONS,
  ),
  feature(
    "Per-series colour, stroke width and dash",
    "staticDataset: [{ color, strokeWidth, strokeDashArray }]",
    CHART_OPTIONS,
  ),
  feature("Line stroke width", "ChartLine({ strokeWidth })", CHART_XY),
  feature(
    "Area opacity and stacking",
    "ChartArea({ fillOpacity, stacked })",
    CHART_OPTIONS,
  ),
  feature(
    "Range area opacity",
    "ChartRangeArea({ fillOpacity })",
    CHART_OPTIONS,
  ),
  feature(
    "Bar stacking, width, corners and orientation",
    "ChartBar({ stacked, roundedCorners, orientation })",
    CHART_OPTIONS,
  ),
  feature(
    "Column stacking, width and corners",
    "ChartColumn({ stacked, columnWidth, roundedCorners })",
    CHART_XY,
  ),
  feature(
    "Scatter point size and labels",
    "ChartScatter({ pointSize, showLabels })",
    CHART_OPTIONS,
  ),
  feature(
    "Colour per mixed series",
    "ChartMixed({ seriesDefs: [{ color }] })",
    CHART_OPTIONS,
  ),
  feature("Radar fill opacity", "ChartRadar({ fillOpacity })", CHART_ADVANCED),
  feature(
    "Donut central labels and arc width",
    "ChartDonut({ centralLabel, centralSubLabel, arcWidth })",
    CHART_CIRCULAR,
  ),
  feature(
    "Radial bar total and hollow size",
    "ChartRadialBar({ showTotal, hollowSize })",
    CHART_OPTIONS,
  ),
  feature(
    "Heatmap shade intensity and distributed colours",
    "ChartHeatmap({ shadeIntensity, distributed })",
    CHART_OPTIONS,
  ),
  feature(
    "Raw ApexCharts options and CSS",
    "rawOptions, rawCss",
    CHART_OPTIONS,
  ),
  feature(
    "Slice and point click events",
    "ChartEvents.SEGMENT_CLICK, ChartEvents.POINT_CLICK",
    CHART_OPTIONS,
  ),
];

export const CARD_FEATURES: PlaygroundFeature[] = [
  feature(
    "Chart in a card with its headline figure",
    "ChartCard({ chart, fetchUrl, valueFormat })",
    CHART_CARDS,
  ),
  feature(
    "ChartCard compared with the previous period",
    "ChartCard({ periodScope })",
    CHART_CARDS,
  ),
  feature(
    "Donut nested in a ChartCard",
    "ChartCard({ chart: ChartDonut() })",
    CHART_CARDS,
  ),
  feature(
    "ChartCard icon, no delta, no legend",
    "ChartCard({ icon, showDelta: false, showLegend: false })",
    CHART_CARDS,
  ),
  feature(
    "ChartCard series legend",
    "ChartCard({ showSeriesLegend: true })",
    CHART_CARDS,
    "0.7.12",
  ),
  feature(
    "ChartCard currency, precision and legend labels",
    "ChartCard({ currencyCode, valuePrecision, primaryLabel, comparisonLabel })",
    CHART_CARDS,
  ),
  feature(
    "KPI card with a static figure and delta",
    "KpiCard({ staticValue, staticDelta, compareLabel })",
    CHART_CARDS,
  ),
  feature(
    "KPI card read for a period",
    "KpiCard({ fetchUrl, periodScope })",
    CHART_DASHBOARD,
  ),
  feature("KPI stat variant", 'KpiCard({ variant: "stat" })', CHART_METRICS),
  feature(
    "KPI value formats",
    "KpiCard({ valueFormat: currency | compact | number | percent })",
    CHART_CARDS,
  ),
  feature(
    "KPI currency and native precision",
    'KpiCard({ currencyCode, valuePrecision: "native" })',
    CHART_CARDS,
  ),
  feature("KPI without delta", "KpiCard({ showDelta: false })", CHART_CARDS),
  feature(
    "KPI sparklines and their accent",
    "KpiCard({ showSparkline, staticSparkline, sparklineAccent })",
    CHART_CARDS,
  ),
  feature(
    "A fall shown as good news",
    "KpiCard({ invert: true })",
    CHART_CARDS,
  ),
  feature(
    "Card payloads built by the response helpers",
    "chartCardData(), kpiCardData()",
    CHART_CARDS,
  ),
  feature(
    "No delta after a period that measured nothing",
    "kpiCardData(points, { previous })",
    CHART_CARDS,
  ),
  feature(
    "Ranked list read for a period",
    "TopListCard({ fetchUrl, periodScope })",
    CHART_TOP_LIST,
  ),
  feature(
    "Rank, top N highlight and colours",
    "TopListCard({ showRank, highlightTopN, rankColor, badgeColor })",
    CHART_TOP_LIST,
  ),
  feature(
    "Ranked list delta and sparkline",
    "TopListCard({ showDelta, showSparkline })",
    CHART_TOP_LIST,
  ),
  feature(
    "Value suffix and proportion bars",
    "TopListCard({ valueSuffix, showBar })",
    CHART_TOP_LIST,
    "0.7.10",
  ),
  feature(
    "Rise shown as bad news, sparkline accent",
    "TopListCard({ invert, sparklineAccent })",
    CHART_TOP_LIST,
  ),
  feature(
    "Scrolling ranked list",
    "TopListCard({ maxHeight })",
    CHART_TOP_LIST,
  ),
  feature(
    "Ranked list currency and precision",
    "TopListCard({ currencyCode, valuePrecision })",
    CHART_TOP_LIST,
  ),
  feature(
    "Ranked list link buttons",
    "TopListCard({ actions })",
    CHART_TOP_LIST,
    "0.7.6",
  ),
  feature(
    "Ranked list skeleton and empty label",
    "TopListCard({ skeletonCount, emptyLabel })",
    CHART_TOP_LIST,
  ),
  feature(
    "Static ranked items with icons",
    "TopListCard({ staticItems })",
    CHART_TOP_LIST,
  ),
  feature(
    "Avatars and value labels on rows",
    "staticItems: [{ avatar, valueLabel }]",
    CHART_TOP_LIST,
    "0.7.10",
  ),
  feature(
    "Row links keeping the page's period",
    'staticItems: [{ to: "...{{query.x.period}}" }]',
    CHART_TOP_LIST,
    "0.7.14",
  ),
  feature(
    "Composed row descriptions",
    "items: [{ description: { key, params } }]",
    CHART_TOP_LIST,
    "0.7.2",
  ),
];

export const PERIOD_FEATURES: PlaygroundFeature[] = [
  feature(
    "Period selector driving cards",
    "PeriodSelector({ id }) + periodScope",
    CHART_PERIOD,
  ),
  feature(
    "Default preset and comparison",
    "PeriodSelector({ defaultPreset, defaultComparison })",
    CHART_PERIOD,
  ),
  feature(
    "Rolling presets (last hour to last 90 days)",
    'presets: ["last-hour", ...]',
    CHART_METRICS,
  ),
  feature(
    "Calendar presets (today to last year)",
    'presets: ["today", "yesterday", "ytd", ...]',
    CHART_PERIOD,
  ),
  feature(
    "All-time preset sending no bounds",
    'presets: ["all"]',
    CHART_PERIOD,
    "0.7.10",
  ),
  feature(
    "Today rolling over at midnight",
    'presets: ["today"]',
    CHART_PERIOD,
    "0.7.16",
  ),
  feature("Comparisons offered, custom included", "comparisons", CHART_PERIOD),
  feature(
    "Comparison as a menu, a toggle or hidden",
    "PeriodSelector({ comparisonControl })",
    CHART_PERIOD,
    "0.7.10",
  ),
  feature(
    "Relabelled presets and comparisons",
    "PeriodSelector({ presetLabels, comparisonLabels })",
    CHART_PERIOD,
  ),
  feature(
    "Selector alignment and sizes",
    "PeriodSelector({ align, size })",
    CHART_PERIOD,
  ),
  feature(
    "Range shown beside the control",
    "PeriodSelector({ showRangeLabel })",
    CHART_PERIOD,
  ),
  feature(
    "Range written relative to now",
    'PeriodSelector({ rangeLabel: "relative" })',
    CHART_PERIOD,
    "0.7.10",
  ),
  feature(
    "Segmented presets",
    'PeriodSelector({ variant: "segmented" })',
    CHART_PERIOD,
  ),
  feature(
    "Custom range capped in days",
    "PeriodSelector({ maxDays })",
    CHART_PERIOD,
    "0.7.16",
  ),
  feature(
    "Remembered period shared between pages",
    "PeriodSelector({ rememberKey })",
    CHART_PERIOD,
    "0.7.10",
  ),
  feature("Period kept in the URL", "?<id>.period=", CHART_PERIOD, "0.7.8"),
  feature(
    "Link opening on a custom range",
    "?<id>.from=&<id>.to=",
    `${CHART_PERIOD}?period-right.from=2026-10-01&period-right.to=2026-10-03`,
    "0.7.16",
  ),
  feature(
    'Default "page" scope of a selector without id',
    'PeriodSelector() + periodScope: "page"',
    CHART_PERIOD,
  ),
  feature(
    "Two independent scopes on one page",
    "two PeriodSelector ids",
    CHART_SCOPES,
  ),
  feature(
    "Period scope owned by a module component",
    "usePeriod() + registerPeriodScope()",
    CHART_PERIOD,
  ),
  feature(
    "Period selector in a card head",
    "Card + PeriodSelector in CARD_ACTIONS_SLOT",
    KEY_VALUE,
  ),
];
