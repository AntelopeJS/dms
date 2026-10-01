import type { UseApexChartInput } from "./useApexChart.types";
import type { ChartType } from "./types";
import {
  readThemeDimmed,
  readThemeHighlighted,
  readThemeMonoFont,
  readThemeTrack,
} from "./useChartTheme";

const DEFAULT_BAR_RADIUS = 4;
const DEFAULT_BAR_WIDTH_PCT = "60%";
const DEFAULT_DONUT_HOLE = "76%";
const DEFAULT_RADIAL_HOLE = "60%";
const CENTER_NAME_FONT_SIZE = "10.5px";
const CENTER_NAME_FONT_WEIGHT = 600;
const CENTER_VALUE_FONT_SIZE = "20px";
const CENTER_VALUE_FONT_WEIGHT = 650;
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
      borderRadiusApplication: "end",
      borderRadiusWhenStacked: "last",
      [widthKey]: widthValue(widthInput, DEFAULT_BAR_WIDTH_PCT),
      distributed: input.distributed ?? false,
    },
  };
}

function donutSizeFor(arcWidth: number | undefined): string {
  if (arcWidth === undefined) return DEFAULT_DONUT_HOLE;
  return `${HUNDRED_PERCENT - arcWidth}%`;
}

/** v2 donut centre: mono eyebrow over a 20px value. */
function centerLabelStyles(): Record<string, Record<string, unknown>> {
  return {
    name: {
      fontFamily: readThemeMonoFont(),
      fontSize: CENTER_NAME_FONT_SIZE,
      fontWeight: CENTER_NAME_FONT_WEIGHT,
      color: readThemeDimmed(),
    },
    value: {
      fontSize: CENTER_VALUE_FONT_SIZE,
      fontWeight: CENTER_VALUE_FONT_WEIGHT,
      color: readThemeHighlighted(),
    },
  };
}

function buildDonutPlot(props: UseApexChartInput): Record<string, unknown> {
  const styles = centerLabelStyles();
  return {
    pie: {
      donut: {
        size: donutSizeFor(props.arcWidth),
        labels: {
          show: !!(props.centralLabel || props.centralSubLabel),
          name: { ...styles.name, show: !!props.centralSubLabel },
          value: { ...styles.value, show: !!props.centralLabel },
          // Apex paints the resting label from `total`, not from `name`.
          total: {
            ...styles.name,
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
      track: { background: readThemeTrack() },
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
