import { z } from "zod";
import {
  type BlockOptionsFor,
  narrowString,
  RegisterBlockType,
  ui,
} from "./block-registry";
import {
  type AreaChartProps,
  type BarChartProps,
  type CandlestickChartProps,
  CHART_COMPONENT_NAME,
  CHART_META_BY_TYPE,
  type ChartAnnotation,
  type ChartColorValue,
  type ChartSeries,
  ChartType,
  type ColumnChartProps,
  type DonutChartProps,
  type DonutRecord,
  type HeatmapChartProps,
  type LineChartProps,
  type MixedChartProps,
  type MixedChartSeriesDef,
  type PieChartProps,
  type RadarChartProps,
  type RadialBarChartProps,
  type RangeAreaChartProps,
  type ScatterChartProps,
  type YRange,
} from "./chart";
import { AxeOrientation } from "./types";
import { HttpMethod } from "./types/http";

const COMPARISON_STYLES = ["dashed", "solid", "dimmed"] as const;
const CHART_CURVES = ["smooth", "straight", "stepline"] as const;
const X_AXIS_TYPES = ["category", "datetime", "numeric"] as const;

const keyValueSchema = z.object({ key: z.string(), value: z.string() });

const yRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
}) satisfies BlockOptionsFor<YRange>;

const xValueSchema = z.union([z.string(), z.number(), z.date()]);

const chartPointSchema = z.union([
  z.number(),
  z.object({
    x: xValueSchema,
    y: z.number().nullable(),
    label: z.string().optional(),
  }),
  z.object({ x: xValueSchema, y: z.tuple([z.number(), z.number()]) }),
  z.object({
    x: xValueSchema,
    y: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  }),
]);

const chartSeriesSchema = z.object({
  name: z.string(),
  data: z.array(chartPointSchema),
  type: z.nativeEnum(ChartType).optional(),
  color: narrowString<ChartColorValue>().optional(),
}) satisfies BlockOptionsFor<ChartSeries>;

const donutRecordSchema = z.object({
  label: z.string(),
  value: z.number(),
}) satisfies BlockOptionsFor<DonutRecord>;

const annotationSchema = z.object({
  y: z.number(),
  y2: z.number().optional(),
  label: z.string().optional(),
  color: narrowString<ChartColorValue>().optional(),
  dashed: z.boolean().optional(),
}) satisfies BlockOptionsFor<ChartAnnotation>;

const mixedSeriesDefSchema = z.object({
  name: z.string(),
  type: z.enum([
    ChartType.LINE,
    ChartType.AREA,
    ChartType.COLUMN,
    ChartType.RANGE_AREA,
  ]),
  color: narrowString<ChartColorValue>().optional(),
}) satisfies BlockOptionsFor<MixedChartSeriesDef>;

const baseChartShape = {
  title: ui(z.string().optional(), { label: "Title", group: "content" }),
  description: ui(z.string().optional(), {
    label: "Description",
    group: "content",
    widget: "textarea",
  }),
  color: ui(
    z
      .union([
        narrowString<ChartColorValue>(),
        z.array(narrowString<ChartColorValue>()),
      ])
      .optional(),
    { label: "Colour", group: "appearance", widget: "color" },
  ),
  height: ui(z.string().optional(), { label: "Height", group: "appearance" }),
  width: ui(z.number().optional(), {
    label: "Width",
    group: "appearance",
    widget: "number",
  }),
  showTooltip: ui(z.boolean().optional(), {
    label: "Show tooltip",
    group: "appearance",
    widget: "switch",
  }),
  showLegend: ui(z.boolean().optional(), {
    label: "Show legend",
    group: "appearance",
    widget: "switch",
  }),
  fetchUrl: ui(z.string().optional(), {
    label: "Data source",
    group: "data",
    widget: "query",
  }),
  fetchUrlMethod: ui(z.nativeEnum(HttpMethod).optional(), {
    label: "HTTP method",
    group: "data",
    widget: "select",
  }),
  periodScope: ui(z.string().optional(), {
    label: "Period scope",
    group: "data",
  }),
  realtimeTopic: ui(z.union([z.string(), z.array(z.string())]).optional(), {
    label: "Realtime topics",
    group: "data",
  }),
  rawOptions: ui(z.array(keyValueSchema).optional(), {
    label: "Raw chart options",
    group: "advanced",
    widget: "json",
  }),
  rawCss: ui(z.array(keyValueSchema).optional(), {
    label: "Raw CSS",
    group: "advanced",
    widget: "json",
  }),
};

const xyChartShape = {
  ...baseChartShape,
  showGrid: ui(z.boolean().optional(), {
    label: "Show grid",
    group: "appearance",
    widget: "switch",
  }),
  staticDataset: ui(z.array(chartSeriesSchema).optional(), {
    label: "Static series",
    group: "data",
    widget: "json",
  }),
  yRange: ui(yRangeSchema.optional(), {
    label: "Y range",
    group: "appearance",
  }),
  comparisonStyle: ui(z.enum(COMPARISON_STYLES).optional(), {
    label: "Comparison style",
    group: "appearance",
    widget: "segmented",
  }),
  smooth: ui(z.boolean().optional(), {
    label: "Smooth",
    group: "appearance",
    widget: "switch",
  }),
  curve: ui(z.enum(CHART_CURVES).optional(), {
    label: "Curve",
    group: "appearance",
    widget: "segmented",
  }),
  annotations: ui(z.array(annotationSchema).optional(), {
    label: "Reference lines",
    group: "appearance",
    widget: "json",
  }),
  syncGroup: ui(
    z
      .string()
      .optional()
      .describe("Charts sharing a group share crosshair and tooltip."),
    { label: "Sync group", group: "behavior" },
  ),
  xaxisType: ui(z.enum(X_AXIS_TYPES).optional(), {
    label: "X axis type",
    group: "appearance",
    widget: "segmented",
  }),
};

const circularChartShape = {
  ...baseChartShape,
  staticDataset: ui(z.array(donutRecordSchema).optional(), {
    label: "Static values",
    group: "data",
    widget: "json",
  }),
};

const fillOpacityOption = () =>
  ui(z.number().optional(), {
    label: "Fill opacity",
    group: "appearance",
    widget: "range",
    min: 0,
    max: 1,
    step: 0.05,
  });

const stackedOption = () =>
  ui(z.boolean().optional(), {
    label: "Stacked",
    group: "appearance",
    widget: "switch",
  });

const roundedCornersOption = () =>
  ui(z.boolean().optional(), {
    label: "Rounded corners",
    group: "appearance",
    widget: "switch",
  });

/** The options `ChartLine` accepts; the factory supplies `type`. */
export const ChartLineSchema = z.object({
  ...xyChartShape,
  strokeWidth: ui(z.number().optional(), {
    label: "Stroke width",
    group: "appearance",
    widget: "number",
    min: 0,
  }),
}) satisfies BlockOptionsFor<Omit<LineChartProps, "type">>;

/** The options `ChartArea` accepts; the factory supplies `type`. */
export const ChartAreaSchema = z.object({
  ...xyChartShape,
  fillOpacity: fillOpacityOption(),
  stacked: stackedOption(),
}) satisfies BlockOptionsFor<Omit<AreaChartProps, "type">>;

/** The options `ChartRangeArea` accepts; the factory supplies `type`. */
export const ChartRangeAreaSchema = z.object({
  ...xyChartShape,
  fillOpacity: fillOpacityOption(),
}) satisfies BlockOptionsFor<Omit<RangeAreaChartProps, "type">>;

/** The options `ChartBar` accepts; the factory supplies `type`. */
export const ChartBarSchema = z.object({
  ...xyChartShape,
  stacked: stackedOption(),
  barWidth: ui(z.number().optional(), {
    label: "Bar width",
    group: "appearance",
    widget: "number",
  }),
  roundedCorners: roundedCornersOption(),
  orientation: ui(z.nativeEnum(AxeOrientation).optional(), {
    label: "Orientation",
    group: "layout",
    widget: "segmented",
  }),
}) satisfies BlockOptionsFor<Omit<BarChartProps, "type">>;

/** The options `ChartColumn` accepts; the factory supplies `type`. */
export const ChartColumnSchema = z.object({
  ...xyChartShape,
  stacked: stackedOption(),
  columnWidth: ui(z.number().optional(), {
    label: "Column width",
    group: "appearance",
    widget: "number",
  }),
  roundedCorners: roundedCornersOption(),
}) satisfies BlockOptionsFor<Omit<ColumnChartProps, "type">>;

/** The options `ChartScatter` accepts; the factory supplies `type`. */
export const ChartScatterSchema = z.object({
  ...xyChartShape,
  pointSize: ui(z.number().optional(), {
    label: "Point size",
    group: "appearance",
    widget: "number",
    min: 0,
  }),
  showLabels: ui(z.boolean().optional(), {
    label: "Show labels",
    group: "appearance",
    widget: "switch",
  }),
}) satisfies BlockOptionsFor<Omit<ScatterChartProps, "type">>;

/** The options `ChartMixed` accepts; the factory supplies `type`. */
export const ChartMixedSchema = z.object({
  ...xyChartShape,
  seriesDefs: ui(z.array(mixedSeriesDefSchema).optional(), {
    label: "Series types",
    group: "data",
    widget: "json",
  }),
}) satisfies BlockOptionsFor<Omit<MixedChartProps, "type">>;

/** The options `ChartRadar` accepts; the factory supplies `type`. */
export const ChartRadarSchema = z.object({
  ...xyChartShape,
  fillOpacity: fillOpacityOption(),
}) satisfies BlockOptionsFor<Omit<RadarChartProps, "type">>;

/** The options `ChartCandlestick` accepts; the factory supplies `type`. */
export const ChartCandlestickSchema = z.object({
  ...xyChartShape,
}) satisfies BlockOptionsFor<Omit<CandlestickChartProps, "type">>;

/** The options `ChartDonut` accepts; the factory supplies `type`. */
export const ChartDonutSchema = z.object({
  ...circularChartShape,
  centralLabel: ui(z.string().optional(), {
    label: "Central label",
    group: "content",
  }),
  centralSubLabel: ui(z.string().optional(), {
    label: "Central sub-label",
    group: "content",
  }),
  arcWidth: ui(z.number().optional(), {
    label: "Arc width",
    group: "appearance",
    widget: "number",
  }),
}) satisfies BlockOptionsFor<Omit<DonutChartProps, "type">>;

/** The options `ChartPie` accepts; the factory supplies `type`. */
export const ChartPieSchema = z.object({
  ...circularChartShape,
}) satisfies BlockOptionsFor<Omit<PieChartProps, "type">>;

/** The options `ChartRadialBar` accepts; the factory supplies `type`. */
export const ChartRadialBarSchema = z.object({
  ...circularChartShape,
  hollowSize: ui(z.string().optional(), {
    label: "Hollow size",
    group: "appearance",
  }),
  showTotal: ui(z.boolean().optional(), {
    label: "Show total",
    group: "appearance",
    widget: "switch",
  }),
}) satisfies BlockOptionsFor<Omit<RadialBarChartProps, "type">>;

/** The options `ChartHeatmap` accepts; the factory supplies `type`. */
export const ChartHeatmapSchema = z.object({
  ...baseChartShape,
  staticDataset: ui(z.array(chartSeriesSchema).optional(), {
    label: "Static series",
    group: "data",
    widget: "json",
  }),
  shadeIntensity: ui(z.number().optional(), {
    label: "Shade intensity",
    group: "appearance",
    widget: "range",
    min: 0,
    max: 1,
    step: 0.05,
  }),
  distributed: ui(z.boolean().optional(), {
    label: "Distributed",
    group: "appearance",
    widget: "switch",
  }),
}) satisfies BlockOptionsFor<Omit<HeatmapChartProps, "type">>;

interface ChartBlockDefinition {
  type: string;
  chartType: ChartType;
  schema: z.ZodTypeAny;
}

const CHART_BLOCKS: ChartBlockDefinition[] = [
  { type: "ChartLine", chartType: ChartType.LINE, schema: ChartLineSchema },
  { type: "ChartArea", chartType: ChartType.AREA, schema: ChartAreaSchema },
  {
    type: "ChartRangeArea",
    chartType: ChartType.RANGE_AREA,
    schema: ChartRangeAreaSchema,
  },
  { type: "ChartBar", chartType: ChartType.BAR, schema: ChartBarSchema },
  {
    type: "ChartColumn",
    chartType: ChartType.COLUMN,
    schema: ChartColumnSchema,
  },
  {
    type: "ChartScatter",
    chartType: ChartType.SCATTER,
    schema: ChartScatterSchema,
  },
  { type: "ChartDonut", chartType: ChartType.DONUT, schema: ChartDonutSchema },
  { type: "ChartPie", chartType: ChartType.PIE, schema: ChartPieSchema },
  { type: "ChartMixed", chartType: ChartType.MIXED, schema: ChartMixedSchema },
  { type: "ChartRadar", chartType: ChartType.RADAR, schema: ChartRadarSchema },
  {
    type: "ChartRadialBar",
    chartType: ChartType.RADIAL_BAR,
    schema: ChartRadialBarSchema,
  },
  {
    type: "ChartHeatmap",
    chartType: ChartType.HEATMAP,
    schema: ChartHeatmapSchema,
  },
  {
    type: "ChartCandlestick",
    chartType: ChartType.CANDLESTICK,
    schema: ChartCandlestickSchema,
  },
];

/** Every chart block type, in the order the palette lists them. */
export const CHART_BLOCK_TYPES = CHART_BLOCKS.map((block) => block.type);

for (const block of CHART_BLOCKS) {
  const meta = CHART_META_BY_TYPE[block.chartType];
  RegisterBlockType({
    type: block.type,
    componentName: CHART_COMPONENT_NAME,
    schema: block.schema,
    // `dms-chart` draws whichever chart `type` names; the factory injects it,
    // so a consumer rendering from the descriptor has to merge it back in.
    fixedOptions: { type: block.chartType },
    meta: {
      name: meta.name,
      icon: meta.icon,
      description: `Chart rendered as ${block.chartType}.`,
      group: "visualization",
    },
  });
}
