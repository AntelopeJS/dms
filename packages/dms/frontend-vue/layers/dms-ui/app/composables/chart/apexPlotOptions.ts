import type { UseApexChartInput } from "./useApexChart.types";
import type { ChartType } from "./types";

const DEFAULT_BAR_RADIUS = 6;
const DEFAULT_BAR_WIDTH_PCT = "60%";
const DEFAULT_DONUT_HOLE = "70%";
const DEFAULT_RADIAL_HOLE = "60%";
const TRACK_BG = "rgba(120,120,120,0.1)";
const HEATMAP_RADIUS = 4;
const HEATMAP_DEFAULT_INTENSITY = 0.6;
const HUNDRED_PERCENT = 100;

type PlotBuilder = (props: UseApexChartInput) => Record<string, unknown>;

function widthValue(
  width: number | undefined,
  fallback: string,
): string | number {
  return width === undefined ? fallback : width;
}

function buildBarPlotOptions(
  input: UseApexChartInput,
  isHorizontal: boolean,
): Record<string, unknown> {
  const widthKey = isHorizontal ? "barHeight" : "columnWidth";
  const widthInput = isHorizontal ? input.barWidth : input.columnWidth;
  return {
    bar: {
      horizontal: isHorizontal,
      borderRadius: input.roundedCorners === false ? 0 : DEFAULT_BAR_RADIUS,
      [widthKey]: widthValue(widthInput, DEFAULT_BAR_WIDTH_PCT),
      distributed: input.distributed ?? false,
    },
  };
}

function donutSizeFor(arcWidth: number | undefined): string {
  if (arcWidth === undefined) return DEFAULT_DONUT_HOLE;
  return `${HUNDRED_PERCENT - arcWidth}%`;
}

function buildDonutPlot(props: UseApexChartInput): Record<string, unknown> {
  return {
    pie: {
      donut: {
        size: donutSizeFor(props.arcWidth),
        labels: {
          show: !!(props.centralLabel || props.centralSubLabel),
          name: { show: !!props.centralSubLabel },
          value: { show: !!props.centralLabel },
          total: {
            show: true,
            label: props.centralSubLabel || props.title || "",
            formatter: () => props.centralLabel ?? "",
          },
        },
      },
    },
  };
}

function buildRadialBarPlot(props: UseApexChartInput): Record<string, unknown> {
  return {
    radialBar: {
      hollow: { size: props.hollowSize || DEFAULT_RADIAL_HOLE },
      track: { background: TRACK_BG },
      dataLabels: {
        total: {
          show: !!props.showTotal,
          label: props.title || "",
        },
      },
    },
  };
}

function buildHeatmapPlot(props: UseApexChartInput): Record<string, unknown> {
  return {
    heatmap: {
      shadeIntensity: props.shadeIntensity ?? HEATMAP_DEFAULT_INTENSITY,
      radius: HEATMAP_RADIUS,
      distributed: props.distributed ?? false,
    },
  };
}

const PLOT_BUILDERS: Partial<Record<ChartType, PlotBuilder>> = {
  bar: (props) => buildBarPlotOptions(props, props.orientation !== "vertical"),
  column: (props) => buildBarPlotOptions(props, false),
  donut: buildDonutPlot,
  radialBar: buildRadialBarPlot,
  heatmap: buildHeatmapPlot,
};

export function buildPlotOptions(
  input: UseApexChartInput,
): Record<string, unknown> {
  return PLOT_BUILDERS[input.type]?.(input) ?? {};
}
