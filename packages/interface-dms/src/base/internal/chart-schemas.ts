import type { z } from "zod";
import { RegisterBlockType } from "../block-registry";
import { ChartType } from "../chart-type";
import {
  ChartAreaSchema,
  ChartBarSchema,
  ChartCandlestickSchema,
  ChartColumnSchema,
  ChartDonutSchema,
  ChartHeatmapSchema,
  ChartLineSchema,
  ChartMixedSchema,
  ChartPieSchema,
  ChartRadarSchema,
  ChartRadialBarSchema,
  ChartRangeAreaSchema,
  ChartScatterSchema,
} from "../chart-schemas";
import { CHART_COMPONENT_NAME, CHART_META_BY_TYPE } from "./chart";

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

/**
 * Every chart block type, in the order the palette lists them.
 *
 * @internal
 */
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
